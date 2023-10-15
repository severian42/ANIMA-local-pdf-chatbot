import { ChatWindowMessage } from "@/schema/ChatWindowMessage";

import { Voy as VoyClient } from "voy-search";

import { WebPDFLoader } from "langchain/document_loaders/web/pdf";
import { HuggingFaceTransformersEmbeddings } from "langchain/embeddings/hf_transformers";
import { VoyVectorStore } from "langchain/vectorstores/voy";
import { ChatOllama } from "langchain/chat_models/ollama";
import { Document } from "langchain/document";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
  PromptTemplate,
} from "langchain/prompts";
import { BaseLanguageModel } from "langchain/base_language";
import { BaseRetriever } from "langchain/schema/retriever";
import { RunnableSequence } from "langchain/schema/runnable";
import { StringOutputParser } from "langchain/schema/output_parser";
import { AIMessage, BaseMessage, HumanMessage } from "langchain/schema";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

const embeddings = new HuggingFaceTransformersEmbeddings({
  modelName: "Xenova/all-MiniLM-L6-v2",
});

const voyClient = new VoyClient();
const vectorstore = new VoyVectorStore(voyClient, embeddings);
const ollama = new ChatOllama({
  baseUrl: "http://localhost:11435",
  temperature: 0.5,
  model: "severian/anima",
});

const REPHRASE_QUESTION_TEMPLATE = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

Chat History:
{chat_history}
Follow Up Input: {question}
Standalone Question:`;

const rephraseQuestionChainPrompt = PromptTemplate.fromTemplate(
  REPHRASE_QUESTION_TEMPLATE,
);

const RESPONSE_SYSTEM_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on provided sources. Using the provided context, answer the user's question to the best of your ability using the resources provided.
The user may not want to dicuss the PDF and that is ok. You can also talk about anything other than the PDF. Do not repeat text. The user is free to discuss anything they'd like without the need to use the PDF.
Anything between the following \`context\` html blocks is retrieved from a knowledge bank, not part of the conversation with the user.
<context>
    {context}
<context/>

REMEMBER: If there is no relevant information within the context, just say "Hmm, I'm not sure." Don't try to make up an answer. Anything between the preceding 'context' html blocks is retrieved from a knowledge bank, not part of the conversation with the user.`;

const responseChainPrompt = ChatPromptTemplate.fromMessages<{
  context: string;
  chat_history: BaseMessage[];
  question: string;
}>([
  ["system", RESPONSE_SYSTEM_TEMPLATE],
  new MessagesPlaceholder("chat_history"),
  ["user", `{question}`],
]);

const formatDocs = (docs: Document[]) => {
  return docs
    .map((doc, i) => `<doc id='${i}'>${doc.pageContent}</doc>`)
    .join("\n");
};

const createRetrievalChain = (
  llm: BaseLanguageModel,
  retriever: BaseRetriever,
  chatHistory: ChatWindowMessage[],
) => {
  if (chatHistory.length) {
    return RunnableSequence.from([
      rephraseQuestionChainPrompt,
      llm,
      new StringOutputParser(),
      retriever,
      formatDocs,
    ]);
  } else {
    return RunnableSequence.from([
      (input) => input.question,
      retriever,
      formatDocs,
    ]);
  }
};

const embedPDF = async (pdfBlob: Blob) => {
  const pdfLoader = new WebPDFLoader(pdfBlob);
  const docs = await pdfLoader.load();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const splitDocs = await splitter.splitDocuments(docs);

  self.postMessage({
    type: "log",
    data: splitDocs,
  });

  await vectorstore.addDocuments(splitDocs);
};

const _formatChatHistoryAsMessages = async (chatHistory: ChatWindowMessage[]) => {
  return chatHistory.map((chatMessage) => {
    if (chatMessage.role === "human") {
      return new HumanMessage(chatMessage.content);
    } else {
      return new AIMessage(chatMessage.content);
    }
  });
}

const queryVectorStore = async (messages: ChatWindowMessage[]) => {
  const text = messages[messages.length - 1].content;
  const chatHistory: ChatWindowMessage[] = messages.slice(0, -1);

  const retrievalChain = createRetrievalChain(
    ollama,
    vectorstore.asRetriever(),
    chatHistory,
  );
  const responseChain = RunnableSequence.from([
    responseChainPrompt,
    ollama,
    new StringOutputParser(),
  ]);

  const fullChain = RunnableSequence.from([
    {
      question: (input) => input.question,
      chat_history: RunnableSequence.from([(input) => input.chat_history, _formatChatHistoryAsMessages]),
      context: RunnableSequence.from([(input) => {
        const formattedChatHistory = input.chat_history
          .map((message: ChatWindowMessage) => `${message.role.toUpperCase()}: ${message.content}`).join('\n');
        return {
          question: input.question,
          chat_history: formattedChatHistory,
        };
      }, retrievalChain]),
    },
    responseChain
  ]);

  const stream = await fullChain.stream({
    question: text,
    chat_history: chatHistory,
  });

  for await (const chunk of stream) {
    if (chunk) {
      self.postMessage({
        type: "chunk",
        data: chunk,
      });
    }
  }

  self.postMessage({
    type: "complete",
    data: "OK",
  });
};

// Listen for messages from the main thread
self.addEventListener("message", async (event: any) => {
  self.postMessage({
    type: "log",
    data: `Received data!`,
  });

  if (event.data.pdf) {
    try {
      await embedPDF(event.data.pdf);
      // Place your postMessage here to indicate the PDF has been embedded
      self.postMessage({
        type: "pdfLoaded",
      });
    } catch (e: any) {
      self.postMessage({
        type: "error",
        error: e.message,
      });
      throw e;
    }
  } else {
    try {
      await queryVectorStore(event.data.messages);
    } catch (e: any) {
      self.postMessage({
        type: "error",
        error: `${e.message}. Make sure you are running Ollama.`,
      });
      throw e;
    }
  }

  // This message indicates the end of processing in any case
  self.postMessage({
    type: "complete",
    data: "OK",
  });
});
