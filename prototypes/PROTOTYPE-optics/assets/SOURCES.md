# Источники ресурсов

- `cad.json`: тесселяция STEP-деталей владельца из `/Users/owner/Downloads/glazok(1)` скриптом `export-cad.py` (FreeCAD). Хэши исходных файлов внутри JSON.
- `studio_small_08_1k.hdr`: Poly Haven, «Studio Small 08», лицензия CC0, <https://polyhaven.com/a/studio_small_08>. Копия файла из `komponent-l01/source/hdris/polyhaven/Studio-Small-08/`.


## Визуальный референс стекла

Проверен на сайте владельца 11 сентября 2026: [«Красивое стекло», раздел «Узоры»](https://krasivoesteklo.ru/), [фотография узора «Авторского»](https://static.tildacdn.com/tild3961-3364-4435-a239-343562393434/image.png).

Наблюдения: неправильные крупные зелёные, жёлтые, красные и синие стёкла; цвет просвечивает; при наложении участки темнеют; кромки дают яркие блики; есть включения и неровная поверхность. Это визуальные ориентиры, не измерение оптических параметров. Фото не встроено в артефакт. Декоративные изображения стекла из верхних блоков сайта не использовались как фотографии реального изделия.

## Дополнительный рендер

- [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer), 0.0.24, MIT.
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh), 0.9.10, MIT.
- Пакеты закреплены в `tooling/package-lock.json`; лицензии сохранены в `vendor/`.

## Физика текущего быстрого прототипа

- [Rapier JavaScript](https://github.com/dimforge/rapier.js), пакет `@dimforge/rapier3d-compat` **0.19.3**, Apache-2.0. Версия закреплена в `tooling/package-lock.json`, копия ESM с WASM внутри в `vendor/rapier.js`, лицензия в `vendor/RAPIER-LICENSE`.
- Cannon-es сохранён для геометрии и математического адаптера; расчёт движения выполняет Rapier.
- Пакеты pathtracer и BVH выше относятся к историческому варианту, в текущий HTML не включаются.

## Живое фото, отдельный прототип

- `glass-photo.png`: фотография узора «Авторского» с сайта владельца, [исходный PNG](https://static.tildacdn.com/tild3961-3364-4435-a239-343562393434/image.png), 1080 × 1080. Сохранена 11 сентября 2026 для запрошенной владельцем анимации. Используется в `PROTOTYPE-photo.html`; исходные пиксели не ретушировались. Это фотография уже отражённого узора, не отдельной физической насыпки.
