# Контракт CAD-оптики

`cad-solid.mjs` не зависит от Three.js, DOM, насыпки или другого оптического модуля. Все координаты являются координатами сборки STEP в миллиметрах. Исходная деталь остаётся в z = −17,65371…−0,5 мм. Поза вращает её вокруг центра её CAD bounding box, затем добавляет `translationMm`. Порядок поворотов `Rz * Ry * Rx`, углы в градусах.

```js
import {CADOpticalSolid} from './elving/cad-solid.mjs';
const solid = new CADOpticalSolid(cad.elving);
const result = solid.trace(
  {origin: [0, 0, -45], direction: [0, 0, 1]},
  {
    pose: {rotationDeg: [0, 0, 0], translationMm: [0, 0, 0]},
    ior: 1.5,
    absorption: [0.006, 0.003, 0.002], // inverse millimetres
    maxInternalReflections: 4,
  },
);
```

`trace` принимает внешний луч с любой стороны детали. Направление нормализуется. Результат содержит:

- `status`: `miss`, `transmitted`, `reflection-limit`, `open-path`, `invalid-orientation` или `origin-inside-unsupported`.
- `ray.origin` и `ray.direction`: выходящий луч в координатах сборки. При `transmitted` начало сдвинуто на 0,00004 мм от последней поверхности наружу. При `miss` это исходный луч.
- `pathMm`: сумма настоящих отрезков внутри CAD, включая полные внутренние отражения.
- `transmittance`: RGB произведение пропускания Fresnel и `exp(-absorption * pathMm)`.
- `reflectance`: доля потери основного проходящего пути по Fresnel. Она используется в локальном приближении блика, а не является отдельным прослеженным отражённым изображением.
- `interfaces`: точки, наружные нормали, номера исходных треугольников, барицентрические координаты и события `enter`, `exit`, `tir` или `reflection-limit`.
- `internalReflections`: число выполненных полных внутренних отражений, не превышает лимит.

`intersect(ray, pose)` возвращает ближайшее пересечение фактического меша с мировыми `point`, `normal`, расстоянием `t` и исходным номером `triangle`. `audit` содержит источник STEP, объём, размеры и проверку замкнутости.

## Поле лучей

`render.mjs` экспортирует `CADRayFieldCache`, `RAY_STATUS` и `viewingRay`. Кэш по умолчанию хранит два последних поля. Изображение, лампа и поглощение не входят в ключ геометрии.

```js
import {CADRayFieldCache, RAY_STATUS} from './elving/render.mjs';
const cache = new CADRayFieldCache(solid);
const field = cache.get({size: 128, viewDeg: 0, pose: {rotationDeg: [0, 0, 0]}});

// Same geometry returns the identical field object, no CAD intersection work.
const exitRay = field.rayAt(pixelIndex);
const cadWeight = field.weightAt(pixelIndex, [0.006, 0.003, 0.002]);
```

`get` принимает `size`, `halfSizeMm`, `viewDeg`, `pose`, `ior` и `maxInternalReflections`. Для другой камеры предусмотрен `rayForPixel(x, y, size)` с обязательным строковым `rayKey`. Ключ должен изменяться при изменении положения или направления любого исходного луча. Такая камера может быть перспективной или иметь произвольную ориентацию.

Поле содержит упакованные `Float32Array`:

- `origins`, `directions`: три значения на пиксель, выход из CAD в миллиметрах и единичное направление.
- `fresnelWeights`, `pathsMm`: одно значение на пиксель. Fresnel без Beer, затем реальная длина пути.
- `firstNormals`, `firstIncidents`: три значения на пиксель, данные для приближённого переднего блика.

`statuses` является `Uint8Array`, коды заданы `RAY_STATUS`. Поля также содержат `statusAt(index)`, `statusCounts`, `meanPathMm`, `geometryMilliseconds` и два подробных контрольных луча `controls`. Массивы кэша считаются неизменяемыми. Размер одного поля 256 × 256 около 4 МБ.

Для продолжения через осколки передаются `field.rayAt(index).origin` и `.direction` в `optical/transport.mjs::transmittedRay`. Цвет умножается на `field.weightAt(index)` и вес осколков. Статус `miss` имеет единичный вес и исходный луч. Статусы `reflection-limit`, `open-path`, `invalid-orientation` и `origin-inside-unsupported` не являются пригодным выходом в насыпку. Поле обновляется при изменении CAD или камеры, при движении одних осколков поле сохраняется.

Плоскость тестовой сетки расположена на z = 28 мм, за CAD-диском `nasipka` z = 10…12 мм. `viewingRay` смотрит от отрицательного z к положительному, ширина демонстрации 44 мм. Демонстрация не добавляет CAD-диск или насыпку в луч, это отдельный опыт эльвинга.
