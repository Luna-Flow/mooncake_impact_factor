import { App } from "../../frontend/src/App";
import { connection } from "next/server";
import type { SearchParamRecord } from "../../lib/search-page-data";

const APP_MODE = process.env["NEXT_PUBLIC_APP_MODE"] === "static" ? "static" : "dynamic";

export default async function AdvancedSearchPage(props: {
  searchParams?: Promise<SearchParamRecord>;
}) {
  if (APP_MODE === "static") {
    return (
      <App
        initialTopPackages={[]}
        initialView="advanced-search"
        dataMode={APP_MODE}
        initialSource={null}
        initialSearchParams={{}}
        initialSearchItems={[]}
        initialSearchError={null}
      />
    );
  }

  await connection();
  const rawParams = props.searchParams ? await props.searchParams : {};
  const { initialSource, initialSearchItems, initialSearchParams, initialSearchError } =
    (await import("../../lib/search-page-data")).getSearchPageData(rawParams);

  return (
    <App
      initialTopPackages={[]}
      initialView="advanced-search"
      dataMode={APP_MODE}
      initialSource={initialSource}
      initialSearchParams={initialSearchParams}
      initialSearchItems={initialSearchItems}
      initialSearchError={initialSearchError}
    />
  );
}
