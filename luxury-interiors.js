/* Complete cafe styles for the existing 2D scene. Tuples list wall, panel,
   shadow, floor, alternate floor, upholstery and metal in that order. */
window.BrewCrewLuxuryInteriors = (() => {
  const collection = {
    int_lux_art_deco: ['Ар-деко', 'Тёмный паркет, латунные веера и изумрудный бархат.', 'planks', 'wainscot', ['#22322b','#162722','#101b18','#503d2f','#443328','#286252','#cc9c4e']],
    int_lux_palace: ['Версаль', 'Слоновая кость, золочёные панели и бордовый бархат.', 'marble', 'wainscot', ['#eee0c4','#ccb68b','#85704c','#e2dbce','#c8bcac','#87394c','#ddbb6f']],
    int_lux_emerald: ['Изумрудный клуб', 'Изумрудный бархат, тёмное дерево и витражи.', 'planks', 'wainscot', ['#345a4b','#223f36','#1c2b22','#785540','#5c3e31','#527950','#c1a16a']],
    int_lux_sakura: ['Сакура', 'Розовая штукатурка, ясень и бумажные фонари.', 'planks', 'slats', ['#e9c5bd','#d8b5a3','#9d7260','#e9dac4','#ddcbb5','#9a4c61','#e7c3a2']],
    int_lux_onyx: ['Оникс', 'Графитовый камень, сталь и холодный свет.', 'concrete', 'slats', ['#373b42','#272b33','#16191e','#55595f','#494e57','#353f50','#bcc5d0']],
    int_lux_terrace: ['Ривьера', 'Лазурная плитка, песчаный камень и обивка цвета моря.', 'checker', 'wainscot', ['#c8ddd6','#74aeb4','#48727b','#d6ccc0','#a5c4c3','#3f8195','#f8ddab']],
    int_lux_library: ['Библиотека', 'Ореховые панели, зелёная кожа и полки с книгами.', 'planks', 'wainscot', ['#9a7958','#684b35','#3e2920','#946944','#765035','#46634a','#d4ab65']],
    int_lux_desert: ['Медина', 'Охристые арки, медь и бирюзовая мозаика.', 'terrazzo', 'wainscot', ['#c8915d','#9e533f','#693c34','#aa6f53','#96583e','#277e78','#eacf87']],
    int_lux_gallery: ['Белая галерея', 'Светлый известняк, терраццо с кобальтовой крошкой и синие кресла.', 'terrazzo', 'wainscot', ['#ebe8dc','#d1d3d2','#7d8790','#e4e0d5','#d8d6cc','#305f9a','#dfbc84']],
    int_lux_violet: ['Сумерки', 'Глубокий индиго, угольное дерево, винный бархат и тёплый бронзовый свет.', 'planks', 'wainscot', ['#25303e','#1e242f','#121820','#34303b','#2e2933','#643f53','#ad8060']],
    int_lux_orangery: ['Оранжерея', 'Шалфейные рейки, ротанг и ботанические панно.', 'oak', 'slats', ['#b2be91','#8c9b70','#55654a','#ceba8e','#c3a976','#6e883f','#e4cf8e']],
    int_lux_copper: ['Медный цех', 'Тёмный кирпич, заклёпки и патинированная медь.', 'concrete', 'brick', ['#925b49','#663f38','#352b28','#706158','#5e524c','#2f7169','#dd9d67']],
    int_lux_observatory: ['Обсерватория', 'Ночной сине-зелёный зал, бронза и кофемашина в духе старого телескопа.', 'terrazzo', 'wainscot', ['#1b383f','#203239','#121f25','#34454c','#2c3b41','#376675','#b08d5b']],
    int_lux_coral: ['Коралловый риф', 'Коралловая штукатурка, светлый травертин и бирюзовая эмаль.', 'concrete', 'wainscot', ['#d89480','#a4695b','#704d45','#e5d3b1','#d8bf9b','#b66953','#dab588']],
    int_winter_grand: ['Зимний гранд', 'Хвоя, тёмный орех, сливочный камень и состаренная латунь.', 'checker', 'wainscot', ['#25483b','#483126','#211d17','#e8dbc2','#d0bda0','#843447','#c3a063']]
  };
  const grand = 'int_winter_grand';
  const grandSeason = '2026-12';
  const separateCounters = new Set(['sakura','library','desert','gallery','violet','orangery','observatory','coral']);
  const styledShelves = new Set(['onyx','terrace','library','observatory','coral']);
  const wallLights = new Set(['palace','onyx','violet','observatory','coral']);
  const styles = Object.fromEntries(Object.entries(collection).map(([id, value]) => {
    const [name, description, floor, pattern, colors] = value;
    const [wall, wall2, trim, fA, fB, upholstery, metal] = colors;
    const rgb = metal.match(/\w\w/g).map(channel => parseInt(channel, 16)).join(',');
    const key = id.slice('int_lux_'.length);
    return [id, {name, description, metal, panels:separateCounters.has(key), shelf:styledShelves.has(key),
      window:key==='library', sconce:wallLights.has(key), longTable:id!==grand,
      fullWall:id!==grand && key!=='emerald' && key!=='terrace',
      image: 'img/interiors/' + id.slice(4) + '.png',
      theme: {wall, wall2, trim, pat:pattern, floor, fA, fB, table:metal, tableLeg:trim, topEdge:wall2,
        rug:upholstery, rugB:metal, back:wall2, tile:wall, tileL:'rgba(255,255,255,.16)',
        woodR:[trim,wall2,metal], chairR:[trim,upholstery,metal], stoolR:[trim,upholstery,metal], longTableR:[trim,wall2,fA],
        glow:rgb, wbar:wall2, wbarE:metal, win:'winA', lamps:null}}];
  }));
  styles.int_lux_palace.theme.win='winB';
  styles.int_lux_art_deco.theme.tile='#253732';
  styles.int_lux_sakura.theme.tile='#c6a291';
  styles.int_lux_gallery.theme.specks=['rgba(45,81,148,.35)','rgba(144,130,114,.30)','rgba(255,255,255,.60)'];
  styles.int_lux_observatory.theme.win='winB';
  styles.int_lux_coral.theme.win='winC';
  styles.int_lux_emerald.theme.win='winD';
  styles.int_lux_desert.theme.win='winB';
  styles.int_lux_orangery.theme.win='winC';
  Object.assign(styles[grand].theme, {
    table:'#ded0b6', topEdge:'#c3a063', chairR:['#3a1824','#843447','#bb727b'],
    glow:'255,207,142', props:'winter_grand'
  });

  return {styles, grand, grandSeason};
})();
