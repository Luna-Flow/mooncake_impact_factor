import type { ReactNode } from "react";

// Pages without a language: they only send the reader to /<lang>/.
export default function RedirectLayout(props: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{props.children}</body>
    </html>
  );
}
