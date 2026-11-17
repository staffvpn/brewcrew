// One medallion template for every badge, including future and administrator badges.
(function(){const paths={cup:'<path d="M16 19h13v9a6 6 0 0 1-12 0v-9Zm13 1h3a4 4 0 0 1 0 8h-3M15 34h17M20 14v2m6-2v2"/>',trophy:'<path d="M18 15h12v9a6 6 0 0 1-12 0v-9Zm0 2h-5v4a5 5 0 0 0 6 5m11-9h5v4a5 5 0 0 1-6 5M24 30v5m-6 0h12"/>',leaf:'<path d="M15 32c-2-11 5-18 18-18 0 13-7 20-18 18Zm2-2 12-12m-6 6v-5m0 5h5"/>',star:'<path d="m24 13 3.5 7 7.5 1-5.5 5.5 1.5 8-7-4-7 4 1.5-8L13 21l7.5-1Z"/>'};
 function kind(b){return /top_|goldown_|vet_|million/.test(b.id)?'trophy':/owner_/.test(b.id)?'star':/^sz/.test(b.id)?'leaf':'cup';}
 function art(b){return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true" class="bc-medallion"><circle cx="24" cy="24" r="22" fill="#6b442b" stroke="#c99446" stroke-width="2"/><circle cx="24" cy="24" r="18.5" fill="#f2ddb0" stroke="#fff2cf"/><circle cx="24" cy="24" r="15.5" fill="#815334"/><g fill="none" stroke="#ffe9ad" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+paths[kind(b)]+'</g><circle cx="10" cy="12" r="1.4" fill="#fff7df"/></svg>';}
 window.BrewCrewBadgeArt={art};
})();
