import { Suspense } from "react";

import { MethodPage } from "../../../frontend/src/components/MethodPage";

export default async function Page(props: { params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  return (
    <Suspense>
      <MethodPage lang={lang} />
    </Suspense>
  );
}
