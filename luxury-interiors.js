/* Complete cafe styles for the existing 2D scene. Tuples list wall, panel,
   shadow, floor, alternate floor, upholstery and metal in that order. */
window.BrewCrewLuxuryInteriors = (() => {
  const collection = {
    int_lux_art_deco: ['Ар-деко', 'Чёрный мрамор, латунные арки и янтарный свет.', 'checker', 'wainscot', ['#26322e','#142521','#111b19','#555953','#c2bca9','#286252','#e2b967']],
    int_lux_palace: ['Версаль', 'Слоновая кость, золочёные панели и бордовый бархат.', 'marble', 'wainscot', ['#eee0c4','#ccb68b','#85704c','#e2dbce','#c8bcac','#87394c','#ddbb6f']],
    int_lux_emerald: ['Изумрудный клуб', 'Изумрудный бархат, тёмное дерево и витражи.', 'planks', 'wainscot', ['#345a4b','#223f36','#1c2b22','#785540','#5c3e31','#527950','#c1a16a']],
    int_lux_sakura: ['Сакура', 'Розовая штукатурка, ясень и бумажные фонари.', 'oak', 'slats', ['#ecc5be','#cb9e91','#8a5a55','#ddbf9e','#edd6b7','#a75162','#fbe0c0']],
    int_lux_onyx: ['Оникс', 'Графитовый камень, сталь и холодный свет.', 'concrete', 'slats', ['#53565d','#32353d','#1c2026','#686b73','#60626b','#353f50','#bfccd7']],
    int_lux_terrace: ['Ривьера', 'Лазурная плитка, песчаный камень и обивка цвета моря.', 'checker', 'wainscot', ['#c8ddd6','#74aeb4','#48727b','#d6ccc0','#a5c4c3','#3f8195','#f8ddab']],
    int_lux_library: ['Библиотека', 'Ореховые панели, зелёная кожа и полки с книгами.', 'planks', 'wainscot', ['#9a7958','#684b35','#3e2920','#946944','#765035','#46634a','#d4ab65']],
    int_lux_desert: ['Медина', 'Охристые арки, медь и бирюзовая мозаика.', 'terrazzo', 'wainscot', ['#c8915d','#9e533f','#693c34','#aa6f53','#96583e','#277e78','#eacf87']],
    int_lux_gallery: ['Белая галерея', 'Известняк, терраццо и кобальтовая мебель.', 'terrazzo', 'wainscot', ['#eeeddf','#cfcfc4','#827e76','#ddd9cf','#cecbc5','#305f9a','#f4cd55']],
    int_lux_violet: ['Сумерки', 'Сливовые стены, сиреневый бархат и лунная подсветка.', 'concrete', 'wainscot', ['#514465','#362d53','#23243d','#56546c','#4b465e','#826baa','#bdccf5']],
    int_lux_orangery: ['Оранжерея', 'Шалфейные рейки, ротанг и ботанические панно.', 'oak', 'slats', ['#b2be91','#8c9b70','#55654a','#ceba8e','#c3a976','#6e883f','#e4cf8e']],
    int_lux_copper: ['Медный цех', 'Тёмный кирпич, заклёпки и патинированная медь.', 'concrete', 'brick', ['#925b49','#663f38','#352b28','#706158','#5e524c','#2f7169','#dd9d67']],
    int_winter_grand: ['Зимний гранд', 'Хвоя, тёмный орех, сливочный камень и состаренная латунь.', 'checker', 'wainscot', ['#25483b','#483126','#211d17','#e8dbc2','#d0bda0','#843447','#c3a063']]
  };
  const grand = 'int_winter_grand';
  const grandSeason = '2026-12';
  const styles = Object.fromEntries(Object.entries(collection).map(([id, value]) => {
    const [name, description, floor, pattern, colors] = value;
    const [wall, wall2, trim, fA, fB, upholstery, metal] = colors;
    const rgb = metal.match(/\w\w/g).map(channel => parseInt(channel, 16)).join(',');
    return [id, {name, description, metal,
      image: 'img/interiors/' + id.slice(4) + '.png',
      theme: {wall, wall2, trim, pat:pattern, floor, fA, fB, table:metal, tableLeg:trim, topEdge:wall2,
        rug:upholstery, rugB:metal, back:wall2, tile:wall, tileL:'rgba(255,255,255,.16)',
        woodR:[trim,wall2,metal], chairR:[trim,upholstery,metal], stoolR:[trim,upholstery,metal],
        glow:rgb, wbar:wall2, wbarE:metal, win:'winA', lamps:null}}];
  }));
  styles.int_lux_palace.theme.win='winF';
  styles.int_lux_emerald.theme.win='winD';
  styles.int_lux_desert.theme.win='winB';
  styles.int_lux_orangery.theme.win='winC';
  Object.assign(styles[grand].theme, {
    table:'#ded0b6', topEdge:'#c3a063', chairR:['#3a1824','#843447','#bb727b'],
    glow:'255,207,142', props:'winter_grand'
  });

  return {styles, grand, grandSeason};
})();
