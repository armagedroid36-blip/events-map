import * as L from './live-dupe-key.mjs';
const k=t=>L.words(t).slice(0,3).join(' ');
const pairs=[
 ['BEYOND DISDANCE — IN-BETWEEN','BEYOND DISDANCE — We Centric',false],
 ['BEYOND DISDANCE — Sprt! — Dimitris Chimonas','BEYOND DISDANCE - PERFORMING ARTS DAY 2 - General Admission',false],
 ['BEYOND DISDANCE — Everest — Eleni Aristeidou','BEYOND DISDANCE - PERFORMING ARTS DΑΥ 1: General Admission Ticket',false],
 ['Творческая мастерская Pangolin: Magic Paper Canvas Workshop','Творческая мастерская Pangolin: Bracelet Making',false],
 ['Cyprus Symphony Orchestra: Chamber Music','Cyprus Symphony Orchestra — Chamber Music',true]];
let ok=0;
for(const [a,b,eq] of pairs){const same=k(a)===k(b); const pass=same===eq; if(pass)ok++; console.log(pass?'PASS':'FAIL', JSON.stringify(k(a)),'vs',JSON.stringify(k(b)));}
console.log(`ИТОГ ${ok}/${pairs.length}`);
