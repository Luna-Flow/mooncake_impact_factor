import { locales } from "../../frontend/src/i18n";

// The language choice of the documentation site's index page: the stored
// choice first (`lf-lang`), then the browser's languages, then English. The
// rest of the path and the query are mapped by `rest`, a function body that
// receives the query string and returns the path after /<lang>.

const targets = locales.map((locale) => ({ path: locale.path, lang: locale.lang.toLowerCase(), label: locale.label }));

function script(rest: string): string {
  return `(function(){var targets=${JSON.stringify(targets)};var choice=null;try{choice=localStorage.getItem("lf-lang")}catch(e){}
if(!targets.some(function(t){return t.path===choice})){choice=null;var wanted=navigator.languages||[navigator.language];
for(var i=0;i<wanted.length&&!choice;i++){var lower=String(wanted[i]).toLowerCase();for(var j=0;j<targets.length;j++){var t=targets[j];var base=t.lang.split("-")[0];
if(lower===t.lang||lower===base||lower.indexOf(base+"-")===0){choice=t.path;break}}}}
var base=${JSON.stringify(process.env["NEXT_PUBLIC_BASE_PATH"] ?? "")};var rest=(function(query){${rest}})(location.search);
location.replace(base+"/"+(choice||targets[0].path)+rest+location.hash)})();`;
}

export function LanguageRedirect(props: { rest?: string }) {
  const rest = props.rest ?? `return "/"+query;`;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: script(rest) }} />
      <noscript>
        <ul>
          {locales.map((locale) => (
            <li key={locale.path}>
              <a href={`/${locale.path}/`}>{locale.label}</a>
            </li>
          ))}
        </ul>
      </noscript>
    </>
  );
}
