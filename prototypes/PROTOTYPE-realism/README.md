# CAD-стенд свободных осколков, тикет01

Фиксированная база: `10ebf5f9eeaa6702811882f495b12b14d0611f49`. Один/два небольших осколка свободно перемещаются в исходных CAD-деталях. Визуальный closed convex solid и native Rapier convexHull используют одинаковые наружные вершины. Скругление с добавленным объёмом отсутствует. Материал диагностический непрозрачный, опыт не проверяет оптику или сходство движения с настоящим образцом.

Из корня выбранного worktree:

```sh
python3 prototypes/PROTOTYPE-realism/build.py
python3 prototypes/PROTOTYPE-realism/preview.py
```

Открыть `http://127.0.0.1:3037/`. Сервер отдаёт только lab HTML на loopback. `PROTOTYPE-lab.html` также открывается двойным щелчком: библиотеки и CAD встроены, запросов в сеть нет. Нужен WebGL2. Сервер остановить Ctrl+C после проверки.

Сборка читает `../PROTOTYPE-optics/vendor/{three.core.js,three.module.js,rapier.js}` и `../PROTOTYPE-optics/assets/cad.json` в том же проекте. Это зависимости на этапе сборки, runtime не импортирует соседний прототип. Лицензии остаются в исходной vendor-папке; происхождение CAD в `../PROTOTYPE-optics/assets/SOURCES.md`. Существующие физический и фото-прототипы не изменяются.

## Что ограничивает камеру

Физические неподвижные trimesh: `trubka`, `nasipka`, `elving`, `krishka` из CAD JSON, без enclosing-hull и коррекции поз. Внутренний радиус трубки19мм, диск nasipka z10…12мм. Максимальный верх эльвинга z−0,5мм даёт номинальные10,5мм до диска. За радиусом14,5мм эльвинг ниже, например z−4мм при x15мм и z−7мм при x18мм; крышка krishka также ограничивает эту зону. Поэтому цилиндр Ø38×10,5мм сам по себе не описывает всю доступную область. nasipka один диск, не источник подвижных тел. Формы6–7,1мм, толщина2–2,4мм, плотность2500кг/м³ явно временные предположения.

Внутри Rapier используются **миллиметры**: gravity9810мм/с², density2,5e−6кг/мм³. `lengthUnit=1000`, normalizedAllowedLinearError1e−5 соответствует0,01мм, шаг1/960с, solver12, contact frequency240Гц, CCD max4substeps. Контактный prediction distance не меняет наружную форму или её объём. Поворот/наклон плавно меняют тяжесть в системе камеры до90°/с. Это квазистатическое воздействие без инерции движущихся стенок. Встряхивание задаёт линейную и угловую скорость тела. Пауза блокирует шаги и сохраняет позы; действие во время паузы будит тело и ждёт продолжения. Native сон останавливает шаги мира. Никакого принудительного сна, раскладки слоями или прижатия к границе.

## Модули и следующий опыт

- `geometry.mjs`: `chamberFromCAD(cad)` возвращает CAD-границы/источники/мм; `makeChip(id)` возвращает vertices/indices/color/provenance одного closed solid; `volumeMm3`, `transformVertices`. Генератор независим от размера камеры.
- `physics.mjs`: `LabPhysics(RAPIER,chamber,count)`, `reset(1|2)`, `orient(rollDeg,tiltDeg)`, `shake()`, `setPaused(bool)`, `step(substeps)`, `dispose()`. RAPIER и CAD внедряются извне. `poses()` отдаёт свежие массивы `{id,positionMm:[x,y,z],rotation:[x,y,z,w],sleeping}`; `snapshot()` включает steps/paused/count/moving и текущие углы; `geometryAudit()` отдаёт копии видимых/native вершин и native volume. Читатели не меняют эти описания.
- `view.mjs`: `LabView(canvas,chamber,physics)`, `rebuild()`, `resize()`, `render()`, `showColliders`, `side`. Прозрачны только неподвижные детали корпуса. Оранжевая линия показывает наружный closed solid, согласованный с native hull численным аудитом.
- `app.mjs`, `shell.html`: только bootstrap и интерфейс опыта01. `window.REALISM.snapshot()/geometry()` позволяют прочитать состояние для повторяемой проверки. Изменённый свет должен читать одни записанные позы, не запускать новую симуляцию.

Следующие исполнители могут владеть **раздельными** `optical/`, `elving/`, `filling/` с собственными entrypoints и build-скриптами. Этому тикету принадлежат только перечисленные корневые модули lab. Оптика двух стёкол, эльвинг перед сеткой, полная насыпка и зеркало здесь не реализованы. Квазистатическую `orient` нельзя выдавать за движение стенок полной будущей насыпки.

## Текущие проверки

```sh
node prototypes/PROTOTYPE-realism/evidence/check.mjs
node prototypes/PROTOTYPE-realism/evidence/browser.mjs
python3 prototypes/PROTOTYPE-optics/build.py
```

Для browser требуется запущенный preview3037; скрипт запускает собственный временный headless Chrome, проверяет отдельный `file://` HTML и3037, завершает Chrome. `checks.json` фиксирует baseSHA, источники/хеши CAD, объёмы, локальные зазоры, нулевые исходные пересечения, SAT-проникновение пары, sampled floor/radius/ceiling и настоящий native manifold contact depth. Замер пути каждую¼секунды, это не доказательство всех возможных поз и движений. Критерий0,2мм сохраняется. Floor-envelope проверка консервативна и не является полным signed distance к невыпуклому CAD; native manifold показан отдельно. `browser.json` проверяет паузу, переключатели, движение, сон/пробуждение, layout390px, WebGL и отсутствие сетевых запросов offline. Кадр `evidence/lab-two-side.png` показывает согласованные оболочки. Бюджет p95≤33мс для полной насыпки пока не измерялся.

Численное ограничение первоначальной meter-версии и целевое исправление: `evidence/scale-note.md`.
