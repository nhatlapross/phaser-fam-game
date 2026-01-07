import "@/styles/globals.css";
import type { AppProps } from "next/app";
import dynamic from "next/dynamic";

const PassportProvider = dynamic(
  () => import("@/components/PassportProvider").then((mod) => mod.PassportProvider),
  { ssr: false }
);

export default function App({ Component, pageProps }: AppProps) {
  return (
    <PassportProvider>
      <Component {...pageProps} />
    </PassportProvider>
  );
}
