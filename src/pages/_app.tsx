import "@/styles/globals.css";
import type { AppProps } from "next/app";
import dynamic from "next/dynamic";

const Web3Provider = dynamic(
  () => import("@/components/Web3Provider").then((mod) => mod.Web3Provider),
  { ssr: false }
);

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Web3Provider>
      <Component {...pageProps} />
    </Web3Provider>
  );
}
