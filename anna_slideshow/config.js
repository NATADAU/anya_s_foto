/**
 * Пути к слайдам — единственное место для смены при публикации на GitHub Pages.
 *
 * Локальный запуск (из корня «Фотоальбом Аня С»):
 *   slidesBase: "../album_slides/"
 *   manifestUrl: "../album_slides/manifest.json"
 *
 * На GitHub Pages, если в репозитории лежат anna_slideshow/ и album_slides/:
 *   оставьте те же относительные пути.
 * Если сайт лежит в корне репозитория рядом с album_slides/:
 *   slidesBase: "./album_slides/"
 *   manifestUrl: "./album_slides/manifest.json"
 */
window.ALBUM_CONFIG = {
  slidesBase: "../album_slides/",
  manifestUrl: "../album_slides/manifest.json",
  defaultIntervalSec: 5,
  fadeMs: 800,
  speedOptionsSec: [3, 5, 7, 10, 15, 20],
  storageKey: "anna_slideshow_interval_sec",
  title: "Аня Сокальская. Фотоальбом",
};
