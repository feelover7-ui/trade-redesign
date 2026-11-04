import {html5Status} from './html5-converter.mjs';
const s=html5Status();
console.log(JSON.stringify({engine:'OZ_HTML5',ready:s.ready,assetConfigured:Boolean(s.assetRoot),browserConfigured:Boolean(s.browser),scripts:s.scripts.length},null,2));
if(!s.ready)process.exitCode=2;
