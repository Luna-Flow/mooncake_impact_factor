import { LanguageRedirect } from "../LanguageRedirect";

// The rankings moved to /<lang>/; old links keep their filters.
export default function Page() {
  return <LanguageRedirect rest={'var p=new URLSearchParams(query);var s=p.get("source");p.delete("source");if(s==="rising"){p.set("momentum","Rising");p.set("sort","growth")}if(p.get("momentum")==="Hot"){p.set("momentum","Rising")}var q=p.toString();return "/"+(q?"?"+q:"");'} />;
}
