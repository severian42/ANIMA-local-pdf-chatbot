"use client";

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { useRef, useState, useEffect, FormEvent } from "react";

import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import { ChatWindowMessage } from '@/schema/ChatWindowMessage';

export function ChatWindow(props: {
  placeholder?: string,
  titleText?: string,
  emoji?: string;
}) {
  const { placeholder, titleText = "An LLM", emoji } = props;
  const [messages, setMessages] = useState<ChatWindowMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPDF, setSelectedPDF] = useState<File | null>(null);
  const [readyToChat, setReadyToChat] = useState(false);
  const [preloadedPDF, setPreloadedPDF] = useState<File | null>(null);

  const worker = useRef<Worker | null>(null);

  async function queryStore(messages: ChatWindowMessage[]) {
    if (!worker.current) {
      throw new Error("Worker is not ready.");
    }

    return new ReadableStream({
      start(controller) {
        if (!worker.current) {
          controller.close();
          return;
        }
        worker.current?.postMessage({ messages });
        const onMessageReceived = (e: any) => {
          switch (e.data.type) {
            case "log":
              console.log(e.data);
              break;
            case "chunk":
              controller.enqueue(e.data.data);
              break;
            case "error":
              worker.current?.removeEventListener("message", onMessageReceived);
              console.log(e.data.error);
              const error = new Error(e.data.error);
              controller.error(error);
              break;
            case "complete":
              worker.current?.removeEventListener("message", onMessageReceived);
              controller.close();
              break;
          }
        };
        worker.current?.addEventListener("message", onMessageReceived);
      },
    });

  }
  
  async function preloadPDF() {
    if (selectedPDF !== null) {
      worker.current?.postMessage({ pdf: selectedPDF });
    }
  }
  

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (isLoading || !input) {
      return;
    }

    const initialInput = input;
    const initialMessages = [...messages];
    const newMessages = [...initialMessages, { role: "human" as const, content: input }];

    setMessages(newMessages)
    setIsLoading(true);
    setInput("");

    try {
      const stream = await queryStore(newMessages);
      const reader = stream.getReader();

      let chunk = await reader.read();

      const aiResponseMessage: ChatWindowMessage = {
        content: "",
        role: "ai" as const,
      };

      setMessages([...newMessages, aiResponseMessage]);

      while (!chunk.done) {
        aiResponseMessage.content = aiResponseMessage.content + chunk.value;
        setMessages([...newMessages, aiResponseMessage]);
        chunk = await reader.read();
      }

      setIsLoading(false);
    } catch (e: any) {
      setMessages(initialMessages);
      setIsLoading(false);
      setInput(initialInput);
      toast(`There was an issue with querying your PDF: ${e.message}`, {
        theme: "dark",
      });
    }
  }

  // We use the `useEffect` hook to set up the worker as soon as the `App` component is mounted.
  useEffect(() => {
    // Fetch your default PDF here, either from local storage or some default path
    const fetchDefaultPDF = async () => {
      const response = await fetch("biomimetics-07-00103.pdf");
      const blob = await response.blob();
      const file = new File([blob], "default.pdf", { type: "application/pdf" });
      setSelectedPDF(file);
    };
    fetchDefaultPDF();
  }, []);
  
  

  async function embedPDF (e: FormEvent<HTMLFormElement>) {
    console.log(e);
    console.log(selectedPDF);
    e.preventDefault();
    // const reader = new FileReader();
    if (selectedPDF === null) {
      toast(`You must select a file to embed.`, {
        theme: "dark",
      });
      return;
    }
    setIsLoading(true);
    worker.current?.postMessage({ pdf: selectedPDF });
    const onMessageReceived = (e: any) => {
      switch (e.data.type) {
        case "log":
          console.log(e.data);
          break;
        case "error":
          worker.current?.removeEventListener("message", onMessageReceived);
          setIsLoading(false);
          console.log(e.data.error);
          toast(`There was an issue embedding your PDF: ${e.data.error}`, {
            theme: "dark",
          });
          break;
        case "complete":
          worker.current?.removeEventListener("message", onMessageReceived);
          setIsLoading(false);
          setReadyToChat(true);
          toast(`Embedding successful! Now try asking a question about your PDF.`, {
            theme: "dark",
          });
          break;
      }
    };
    worker.current?.addEventListener("message", onMessageReceived);
  }
  
  
  const choosePDFComponent = (
    <>
      <div className="p-4 md:p-8 rounded bg-[#25252d] w-full max-h-[85%] overflow-hidden flex flex-col">
        <h1 className="text-3xl md:text-4xl mb-2 ml-auto mr-auto">
          ANIMA - Chat with your PDF
        </h1>
        
        <ul>
          <li className="text-l">
            
            <span className="ml-2">
              Harness ANIMA to chat with your PDF!
            </span>
          </li>
          <li className="hidden text-l md:block">
           
          </li>
          <li>
            ⚙️
            <span className="ml-2">
              The default LLM is Llama 2 run locally by Ollama. You&apos;ll need to install <a target="_blank" href="https://ollama.ai">the Ollama desktop app</a> and run the following commands to give this site access to the locally running model:
              <br/>
              <pre className="inline-flex px-2 py-1 my-2 rounded">$ ollama run severian/anima
              <br/>
              $ OLLAMA_ORIGINS=https://https://anima-pdf-chat.vercel.app OLLAMA_HOST=127.0.0.1:11435 ollama serve</pre>
            </span>
          </li>
          <li className="hidden text-l md:block">
           
          </li>
          <li className="text-l">
         
          </li>
          <li className="text-l">
            👇
            <span className="ml-2">
              Try embedding a PDF below, then asking questions! You can even turn off your WiFi.
            </span>
          </li>
        </ul>
      </div>
      <form onSubmit={embedPDF} className="mt-4 flex justify-between items-center w-full">
      <input id="file_input" type="file" accept="pdf" className="text-white" onChange={(e) => e.target.files ? setSelectedPDF(e.target.files[0]) : null}></input>
        <button type="submit" className="shrink-0 px-8 py-4 bg-sky-600 rounded w-28">
          <div role="status" className={`${isLoading ? "" : "hidden"} flex justify-center`}>
            // Your loading SVG here
          </div>
          <span className={isLoading ? "hidden" : ""}>Embed</span>
        </button>
      </form>
    </>
  );

  const chatInterfaceComponent = (
    <>
      <div className="flex flex-col-reverse w-full mb-4 overflow-auto grow">
        {messages.length > 0 ? (
          [...messages]
            .reverse()
            .map((m, i) => (
              <ChatMessageBubble key={i} message={m}></ChatMessageBubble>
            ))
        ) : (
          ""
        )}
      </div>
  
      <form onSubmit={sendMessage} className="flex w-full flex-col">
        <div className="flex w-full mt-4">
          <input
            className="grow mr-8 p-4 rounded"
            value={input}
            placeholder={placeholder ?? "What's it like to be a pirate?"}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="shrink-0 px-8 py-4 bg-sky-600 rounded w-28">
            <div role="status" className={`${isLoading ? "" : "hidden"} flex justify-center`}>
              {/* Your loading SVG here */}
            </div>
            <span className={isLoading ? "hidden" : ""}>Send</span>
          </button>
        </div>
      </form>
    </>
  );
  
  return (
    <div className={`flex flex-col items-center p-4 md:p-8 rounded grow overflow-hidden ${readyToChat ? "border" : ""}`}>
      <h2 className={`${readyToChat ? "" : "hidden"} text-2xl`}> {titleText}</h2>
      {readyToChat ? chatInterfaceComponent : choosePDFComponent}
      <ToastContainer/>
    </div>
  );
  
} 


