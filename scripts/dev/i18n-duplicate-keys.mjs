import fs from "fs";
for (const l of ["en-us","zh-tw"]) {
  const src = fs.readFileSync(new URL(`../../src/i18n/${l}/index.js`, import.meta.url),"utf8");
  const keys = [...src.matchAll(/^  ("[^"]+"|[A-Za-z_$][\w$]*):/gm)].map(m=>m[1].replace(/"/g,""));
  console.log(l, keys.length, "dups:", [...new Set(keys.filter((k,i)=>keys.indexOf(k)!==i))]);
}
