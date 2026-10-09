import { Suspense } from "react";

import { PackagePage } from "../../../frontend/src/components/PackagePage";

// /<lang>/package/?name=<owner>/<name>: one page for every package, so the
// static export does not need a file per package.
export default async function Page(props: { params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  return (
    <Suspense>
      <PackagePage lang={lang} />
    </Suspense>
  );
}
