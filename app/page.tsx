"use client";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const handleButtonClick = (url: string) => {
    router.push(url);
  };
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center gap-20 py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="flex flex-col items-center gap-2 text-center sm:items-start sm:text-left">
          <h2 className="font-bold uppercase text-3xl">Discover</h2>
        </div>
        <div className="flex flex-col items-center mx-auto gap-6 text-center w-3/4  sm:items-start sm:text-left">
          <button onClick={() => handleButtonClick("/discover")} className="cursor-pointer bg-sky-700 py-3 w-full text-white text-center rounded-2xl hover:bg-sky-600">Phase 1 (MVP)</button>
          <button onClick={() => handleButtonClick("/phase2")} className="cursor-pointer bg-sky-700 py-3 w-full text-white text-center rounded-2xl hover:bg-sky-600">Phase 2</button>
          <button onClick={() => handleButtonClick("/phase3")} className="cursor-pointer bg-sky-700 py-3 w-full text-white text-center rounded-2xl hover:bg-sky-600">Phase 3</button>
        </div>
      </main>
    </div>
  );
}
