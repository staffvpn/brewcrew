// The API middleware dispatches all lab requests before live handlers.
import {json} from '../_lib.js';
export function onRequestPost(){return json({ok:false,error:'Открой Админскую кнопкой в /admin'},403);}
