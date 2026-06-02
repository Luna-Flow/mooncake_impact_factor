import { App } from "../../frontend/src/App";
import { getSearchPageData, type SearchParamRecord } from "../../lib/search-page-data";

export const dynamic = "force-dynamic";

export default async function AdvancedSearchPage(props: {
  searchParams?: Promise<SearchParamRecord>;
}) {
  const rawParams = props.searchParams ? await props.searchParams : {};
  const { initialSource, initialSearchItems, initialSearchParams } = getSearchPageData(rawParams);

  return (
    <App
      initialTopPackages={[]}
      initialView="advanced-search"
      initialSource={initialSource}
      initialSearchParams={initialSearchParams}
      initialSearchItems={initialSearchItems}
    />
  );
}
