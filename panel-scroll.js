/* Stop sideways movement of sheets while preserving nested horizontal catalogs. */
(function(){'use strict';
const roots='.sheetbody,.sheethead,.sheet,.modal,.bc-staff-content';
let gesture=null;
function horizontalStrip(target,root){for(let e=target;e&&e!==root;e=e.parentElement){const style=getComputedStyle(e);if(/^(auto|scroll)$/.test(style.overflowX)&&e.scrollWidth>e.clientWidth+1)return true;}return false;}
document.addEventListener('touchstart',e=>{gesture=null;if(e.touches.length!==1||!(e.target instanceof Element))return;const root=e.target.closest(roots);if(!root||e.target.closest('input,textarea,select,[contenteditable="true"]'))return;gesture={x:e.touches[0].clientX,y:e.touches[0].clientY,strip:horizontalStrip(e.target,root),axis:null};},{passive:true,capture:true});
document.addEventListener('touchmove',e=>{if(!gesture||e.touches.length!==1)return;const dx=Math.abs(e.touches[0].clientX-gesture.x),dy=Math.abs(e.touches[0].clientY-gesture.y);if(!gesture.axis&&Math.max(dx,dy)>6)gesture.axis=dx>dy?'x':'y';if(gesture.axis==='x'&&!gesture.strip&&e.cancelable)e.preventDefault();},{passive:false,capture:true});
for(const event of ['touchend','touchcancel'])document.addEventListener(event,()=>{gesture=null;},{passive:true,capture:true});
document.addEventListener('scroll',e=>{const target=e.target;if(target instanceof Element&&target.matches(roots)&&target.scrollLeft)target.scrollLeft=0;},{passive:true,capture:true});
})();
