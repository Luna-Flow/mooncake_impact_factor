import { Suspense } from "react";

import { RankingPage } from "../../frontend/src/components/RankingPage";

export default async function Page(props: { params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  return (
    <Suspense>
      <RankingPage lang={lang} />
    </Suspense>
  );
}
