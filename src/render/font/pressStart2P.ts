/** Единственный шрифт первой версии. Файл лежит в public/fonts вместе с лицензией OFL. */
export const PRESS_START_2P = {
  id: 'press-start-2p',
  family: 'Press Start 2P',
  url: `${import.meta.env.BASE_URL}fonts/PressStart2P-Regular.ttf`,
} as const;

const range = (from: number, to: number): string =>
  Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i)).join('');

/** Группы символов, которые реально есть в шрифте (по таблице cmap TTF). */
export const CHARSET_GROUPS: readonly { readonly title: string; readonly chars: string }[] = [
  { title: 'ASCII', chars: range(0x21, 0x7e) },
  {
    title: 'Latin',
    chars:
      '¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ' +
      'ĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĨĩĪīĬĭĮįİıĲĳĴĵĶķĸĹĺĻļĽľĿŀŁłŃńŅņŇňŊŋŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŤťŦŧŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſƒȚț',
  },
  {
    title: 'Greek',
    chars: 'ΆΈΉΊΌΎΏΐΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩΪΫάέήίΰαβγδεζηθικλμνξοπρςστυφχψωϊϋόύώ',
  },
  {
    title: 'Cyrillic',
    chars:
      'ЀЁЂЃЄЅІЇЈЉЊЋЌЍЎЏАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюяѐёђѓєѕіїјљњћќѝўџ' +
      'ѢѣѪѫѲѳѴѵҐґҒғҔҕҖҗҘҙҚқҜҝҠҡҢңҤҥҪҫҬҭҮүҰұҶҷҸҹҺһӀӁӂӋӌӏӐӑӒӓӔӕӖӗӘәӜӝӞӟӢӣӤӥӦӧӨөӮӯӰӱӲӳӴӵӶӷӸӹԚԛԜԝԤԥ',
  },
  {
    title: 'Symbols',
    chars: '–—―‘’‚“”„†‡•…‰‹›⁄€₮₯₴₸₽№™←↑→↓∂∆∏∑∕√∞∫≈≠≤≥▲▶▼◀◊★☆♠♣♥♦♪',
  },
];

export async function loadFont(): Promise<void> {
  const face = new FontFace(PRESS_START_2P.family, `url(${PRESS_START_2P.url})`);
  await face.load();
  document.fonts.add(face);
}
