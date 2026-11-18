/**
 * The system's tours as data (author, 2026-11-16): the tours themselves (module/tours/pust-tour.mjs) and the journal
 * «Довідка Foundry» (tours.mjs) are both made from it. Bump HELP_VERSION when a text changes, so worlds rebuild the journal.
 * Tour: { id, title, description, gm (GM-only), first (starts on the first entry), next: [tour ids], steps }.
 * Step: { id, title, content (HTML), selector?, tooltipDirection?, prepare? ("name:arg" or a list, PREPARE in pust-tour.mjs),
 *         fallback? (shown in the middle when the element isn't there), actions? [{label, act}] (ACTIONS) }.
 * `brief`: what the step is about (for whoever writes the text; not shown).
 */
import { TOUR_DESCRIPTIONS, TOUR_TEXTS } from "./tour-texts.mjs";

export const HELP_VERSION = 104;

const CHAR = ".pust-sheet:not(.pust-caravan-sheet):not(.pust-en-sheet):not(.pust-place-sheet)";
const CAR = ".pust-caravan-sheet";
const EN = ".pust-en-sheet";
const TERM = "#pust-terminal";
const DOCK = "#pust-mapdock";

const S = (id, brief, extra = {}) => ({ id, brief, title: "", content: "", ...extra });

export const TOURS = [
  /* ================================ Доглядач ================================ */
  {
    id: "gm-start", gm: true, first: true, next: ["gm-map"], title: "Початок", description: "",
    steps: [
      S("hello", "Вітання Доглядача: що таке ця система у Foundry, що тур короткий, ланцюжок турів, × виходить, повторити — журнал «Довідка Foundry».", { prepare: ["closeAll", "scene:map"] }),
      S("quickstart", "«Швидкий старт»: пригода з персонажами, караваном, ворогами й готовими сценами битв; наступні тури показують саме її. Кнопка імпорту.", { actions: [{ label: "Імпортувати «Швидкий старт»", act: "importQuickstart" }] }),
      S("packs", "Компендіуми: «Довідки по правилах» (уся вікі), «Супротивники» (перетягни на сцену), «Швидкий старт».", { selector: '#compendium [data-pack$=".rules"]', prepare: "sidebar:compendium", tooltipDirection: "LEFT",  }),
      S("actors", "Вкладка акторів: «Відкрити .json Пустельників» — персонаж чи караван з HTML-аркуша. «Create Actor» — персонаж, караван, ворог (форма «Новий супротивник»).", { selector: ".wastelanders-json-open", prepare: "sidebar:actors", tooltipDirection: "LEFT",  }),
      S("users", "Нові гравці: Settings → User Management → Create Additional User (ім'я, роль, пароль), Save and Return; адреса для гравців — Invitation Links.", { selector: '#settings [data-app="players"]', prepare: ["closeAll", "sidebar:settings"], tooltipDirection: "LEFT" }),
      S("players", "Гравці внизу ліворуч: персонажа призначають гравцю через його налаштування (User Configuration → Character). Тоді «Кістки», «Зробити перевірку» й ЖД працюють за нього.", { selector: "#players-active", tooltipDirection: "UP",  }),
      S("chat", "Режими чату: усі картки системи (перевірки, шкода, Доля) йдуть у вибраному режимі — публічно, лише Доглядачу, таємно.", { selector: '[data-action="messageMode"][data-mode="public"]', prepare: "sidebar:chat", tooltipDirection: "LEFT",  }),
      S("terminal", "Кнопка «Термінал Доглядача»: генератори справ, подорожей, натхнення, битв. Окремий тур далі.", { selector: ".wastelanders-terminal-open", tooltipDirection: "DOWN",  }),
      S("next", "Що далі: тури «Мапа Пустки», «Термінал», «Битва», «Персонажі й караван»; у журналі «Довідка Foundry» усе текстом, кнопка «Пройти тур».", {  }),
    ],
  },
  {
    id: "gm-map", scene: "map", gm: true, next: ["gm-terminal"], title: "Мапа Пустки", description: "",
    steps: [
      S("scene", "Сцена «Мапа Пустки»: спільна мапа, по якій їде караван; клітинки, лінійка Foundry. Панелі ліворуч тягнуться за заголовок, клік — згорнути, подвійний клік — на місце.", { prepare: ["closeAll", "scene:map"] }),
      S("places", "Поселення / Небезпека / Точка інтересу: клік — і клік по мапі ставить місце з випадковою назвою й аспектами; картка місця, «Видиме / Приховане» (гравці бачать лише видимі), «Закріплене», «В чат», «В журнал».", { selector: `${DOCK} [data-mapdock="town"]`, prepare: ["closeAll", "unfold:map"], tooltipDirection: "RIGHT",  }),
      S("placecard", "Картка місця: назва з кубиком, тип поселення, експеримент сховища, аспекти (поле + Enter або кубик) з безкоштовними Посиленнями, примітка; гравці читають, поки місце видиме.", { selector: ".pust-place-sheet", prepare: ["closeAll", "sheet:place"], tooltipDirection: "RIGHT" }),
      S("note", "«Примітка»: стікер на мапі, подвійний клік — писати, кольори, приховати від гравців, згорнути.", { selector: `${DOCK} [data-mapdock="note"]`, tooltipDirection: "RIGHT",  }),
      S("notedemo", "Стікер-приклад з відкритим редактором: заголовок і текст пишуть на стікері, зберігається під час набору; панель: 5 кольорів, «Сховати від гравців», «Згорнути до позначки», «Закріпити», «Видалити» (двічі); подвійний клік відкриває редактор, тягнуть за смужку заголовка.", { selector: ".pust-mn-edit", prepare: "noteDemo", tooltipDirection: "DOWN" }),
      S("travel", "«Подорож»: генератор подорожі з удачею вибраного каравану; бої з події — «Створити битву».", { selector: `${DOCK} [data-mapdock="travel"]`, tooltipDirection: "RIGHT",  }),
      S("travelwin", "Вікно «Подорож Пусткою»: тип події, Удача партії −2…+2 (з каравану, можна змінити; для поганої зустрічі не діє), «Згенерувати подію», «В чат», кістки в тексті, «Інші види», «Створити битву».", { selector: `${DOCK} .pust-md-tv`, prepare: "travel", tooltipDirection: "RIGHT" }),
      S("counters", "«Лічильники»: «+» — новий лічильник сцени (кістка, −2…+2) або гри (поділки з описами); гравці бачать їх лише для читання.", { selector: `${DOCK} [data-unit="ctr"] .pust-md-add`, prepare: "unfold:ctr", tooltipDirection: "RIGHT",  }),
      S("ctrform", "Форма нового лічильника: «Гра» / «Сцена»; гра: назва, поділки 4…20 або «Свій» до 100, «Зараз»; сцена: назва загрози, кістка, початок; «Додати» / «Скасувати».", { selector: `${DOCK} .pust-gc-form`, prepare: "counterForm", tooltipDirection: "RIGHT" }),
      S("ctrmade", "Готові лічильники (приклади, лише на екрані): сцени з кнопками −2 невдача … +2 крит, загроза на 0, розв'язано на максимумі; гри з −/+, поділками з описами, назва в полі, × двічі; зміни пишуться в чат.", { selector: `${DOCK} .pust-md-ctr-gm .pust-md-body`, prepare: "counterDemo", tooltipDirection: "RIGHT" }),
      S("dice", "«Кістки»: N×d6/d8/d10/dN у чат. «Доля»: кістка Долі за виділені токени, а без виділення — список персонажів гравців і караванів з галочками.", { selector: `${DOCK} [data-mapdice="fate"]`, prepare: "unfold:dice", tooltipDirection: "RIGHT",  }),
      S("scenepanel", "Панель «Сцена» (угорі праворуч): місце й небезпека, жетони Долі, шкода й лікування персонажам і караванам зі списку, спільні значення, «Перейти на бойову мапу».", { prepare: "unfold:dmg", selector: `${DOCK} [data-unit="dmg"]`, tooltipDirection: "LEFT" }),
      S("caravan", "Караван на мапі: при русі токена питає, чи списати запас ходу (1 клітинка — 1 одиниця, «Тачка» — 3 клітинки); перемикач «Витрачати автоматично» в аркуші каравану. Приклад: питання над токеном каравану (5 клітинок), нічого не рухається.", { selector: ".pust-cmove-demo", prepare: ["closeAll", "scene:map", "moveDemo"], tooltipDirection: "RIGHT" }),
    ],
  },
  {
    id: "gm-terminal", gm: true, next: ["gm-battle"], title: "Термінал Доглядача", description: "",
    steps: [
      S("open", "Термінал: вікно генераторів, результат лишається у вікні, «В чат» — показати гравцям, «В журнал» — зберегти для підготовки.", { selector: ".wastelanders-terminal-open", prepare: "closeAll", tooltipDirection: "DOWN",  }),
      S("case", "«Справа»: складність → «Згенерувати справу»; кожен блок можна перекинути кубиком праворуч.", { selector: `${TERM} [data-action="caseGen"]`, prepare: "terminal:case", tooltipDirection: "LEFT",  }),
      S("journal", "«В журнал»: справа (або битва) стає журналом у теці «Термінал Доглядача», кістки в ньому кидаються кліком.", { prepare: ["terminal:case", "termGen:case"], selector: `${TERM} [data-action="toJournal"][data-what="case"]`, tooltipDirection: "LEFT",  }),
      S("travel", "«Подорож»: тип (подорож чи погана зустріч), удача партії, «Згенерувати подію».", { selector: `${TERM} [data-action="travelGen"]`, prepare: "terminal:travel", tooltipDirection: "LEFT",  }),
      S("tables", "«Натхнення»: імена, нагороди, вантажі, місця, небезпеки — кожна таблиця «Згенерувати» і «В чат».", { selector: `${TERM} [data-action="tableGen"]`, prepare: "terminal:tables", tooltipDirection: "LEFT",  }),
      S("battle", "«Битви»: «Згенерувати битву» за фракцією й складністю; місце, небезпека, нагорода.", { selector: `${TERM} [data-action="battleGen"]`, prepare: "terminal:battle", tooltipDirection: "LEFT",  }),
      S("place", "«Розмістити»: вороги стають акторами в теці «Битви» і токенами на сцені (на бойовій мапі — по зонах); «Додати теку в Актори» — лише актори.", { prepare: ["terminal:battle", "termGen:battle"], selector: `${TERM} [data-action="battleCreate"][data-mode="place"]`, tooltipDirection: "LEFT" }),
    ],
  },
  {
    id: "gm-battle", scene: "battle", gm: true, next: ["gm-enemy"], title: "Битва", description: "",
    steps: [
      S("scene", "Бойова мапа: битви йдуть зонами, не клітинками. «Create Scene» питає тип: «Битва» чи «Мапа». У «Швидкому старті» чотири готові сцени.", { prepare: ["closeAll", "scene:battle"] }),
      S("zone", "«Зона»: прямокутник з назвою й аспектами; тягни за смужку, кут — розмір, подвійний клік — редактор (назва, колір, аспекти). Токен належить зоні, де стоїть його центр.", { selector: '.pust-md-battle [data-battle="zone"]', prepare: "unfold:map", tooltipDirection: "LEFT",  }),
      S("zoneedit", "Редактор зони (зона сцени з найбільшою кількістю аспектів; без зон — приклад, ніде не записаний): назва з кісткою випадкової назви для місця, аспекти: поле + Enter або кістка (підставляє в поле), −/+ безкоштовні Посилення, ×; панель: 5 кольорів, «Обрати всіх», «Видалити» (двічі); Esc або клік поза ним закриває.", { selector: ".pust-bz-edit", prepare: "zoneDemo", tooltipDirection: "LEFT" }),
      S("enemy", "«Супротивник»: фракція → ворог → кількість → зона; ставить токени (обличчя різні). Місце й небезпека битви — кидки вгорі панелі; випадкові назви й аспекти зон — під місце.", { selector: ".pust-md-battle .pust-md-bsetup", tooltipDirection: "LEFT",  }),
      S("enemyform", "Форма «Супротивник»: Фракція, Супротивник (компендіум «Супротивники»), Скільки 1…30, Зона (без зон — біля центру огляду); «Додати»: актор у «Битви → фракція» (наявний береться), токени на вільні клітинки зони під смужкою, номери в іменах, різні обличчя; «Скасувати».", { selector: ".pust-md-battle .pust-md-bform", prepare: "enemyForm", tooltipDirection: "LEFT" }),
      S("round", "«Коло дій»: ▶ — нове коло, картка в чаті нагадує порядок (спершу гравці). «Жетони Долі» Доглядача: −/+ і «За гравцями»; витрата пише в чат без числа.", { selector: ".pust-md-battle .pust-md-brf", tooltipDirection: "LEFT",  }),
      S("overview", "«Огляд битви» (праворуч під «Битвою»): вороги, персонажі гравців і каравани сцени за зонами; ОЗ −/+, аспекти, атаки з «Цілям», ходи, мішень цілі в рядку, видимість, картка; Alt+X.", { selector: '#pust-mapdock [data-unit="ovw"]', prepare: "unfold:ovw", tooltipDirection: "LEFT" }),
      S("targets", "Цілі: шкода й лікування йдуть лише на цілі (трикутні мітки навколо токена). Угорі «Огляду битви»: лічильник, «Вибрати цілі», «Зняти вибір»; у рядку мішень; на зоні «Обрати всіх».", { selector: "#pust-mapdock .pust-ov-tgts", prepare: "unfold:ovw", tooltipDirection: "LEFT" }),
      S("targetlook", "Як виглядає ціль: токен сцени (ворог) тимчасово обрано ціллю, трикутні мітки навколо; клавіша T над токеном теж обирає; попередні цілі повертаються.", { selector: ".pust-tgt-demo", prepare: "targetDemo", tooltipDirection: "RIGHT" }),
      S("damage", "«Шкода й лікування»: число чи кістки, тип, «Ігнорує броню», «½ шкоди» → «Завдати шкоди» / «Лікувати». Броня, захисти й половинки рахуються самі; картка в чаті.", { selector: ".pust-md-battle .pust-md-bhit", tooltipDirection: "LEFT",  }),
      S("end", "«Кінець сцени» / «Новий день» / «Кінець сесії» для всіх персонажів, призначених гравцям, без відкриття аркушів; «Скинути ходи ворогів сцени»; коло дій знову 1, жетони Долі Доглядача «за гравцями»; одна картка в чаті; сесія питає підтвердження; номер сесії групи й кнопка скидання відліку (двічі). Те саме в панелі «Сцена».", { selector: ".pust-md-battle .pust-md-bend", tooltipDirection: "LEFT" }),
    ],
  },
  {
    id: "gm-enemy", gm: true, next: ["gm-char"], title: "Картка ворога", description: "",
    steps: [
      S("en-head", "Картка ворога: шапка — портрет, ім'я (кубик кидає ім'я), категорія; ті самі позначки на токені.", { selector: `${EN} .pust-en-hd`, prepare: ["closeAll", "sheet:enemy"], tooltipDirection: "RIGHT",  }),
      S("en-reveal", "Перемикач «Видимий / Прихований»: картка для гравців і токени разом; Hide токена перемикає картку.", { selector: `${EN} [data-action=\"revealToggle\"]`, tooltipDirection: "DOWN",  }),
      S("en-chat", "«В чат»: уся картка ворога в чат — ОЗ і стан, броня, лише відмінні від звичайних захисти, атаки, аспекти, ходи, примітки; гравці дізнаються про ворога в грі.", { selector: `${EN} [data-action="toChat"]`, tooltipDirection: "DOWN" }),
      S("en-edit", "«Редагувати»: ОЗ, броня, атаки, ходи, захисти; заготовки; «Як у книзі».", { selector: `${EN} [data-action=\"editToggle\"]`, tooltipDirection: "DOWN",  }),
      S("en-hp", "ОЗ −/+ і броня; на 0 ОЗ токен перекреслено.", { selector: `${EN} .pust-en-hp`, tooltipDirection: "RIGHT",  }),
      S("en-aspects", "Ситуативні аспекти: швидкі одним кліком, свої, безкоштовні Посилення −/+; видно під токеном.", { selector: `${EN} .pust-en-card:has(.pust-en-quick)`, tooltipDirection: "RIGHT",  }),
      S("en-attacks", "Атаки: чіп кісток кидає в чат; «Завдати цілям» кидає й б'є цілі, витрачає заряд; Психо/Камікадзе самі.", { selector: `${EN} .pust-en-card:has(.pust-en-atkhd)`, tooltipDirection: "RIGHT",  }),
      S("en-details", "Згортка «Деталі»: аспекти з книги з Посиленнями, ходи з «використано», хід лікування, кістки в тексті — чіпи.", { selector: `${EN} details[data-fold=\"details\"]`, prepare: `open:${EN} details[data-fold=\"details\"]`, tooltipDirection: "RIGHT",  }),
      S("en-defence", "Згортка «Захист»: броня, пси-броня, захисти від типів (½ / імунітет), особливості; рахуються самі.", { selector: `${EN} details[data-fold=\"defence\"]`, prepare: `open:${EN} details[data-fold=\"defence\"]`, tooltipDirection: "RIGHT",  }),
      S("en-new", "Новий ворог: Create Actor → Супротивник, форма «Новий супротивник».", { selector: "#actors .create-entry", prepare: ["closeAll", "sidebar:actors"], tooltipDirection: "LEFT",  }),
      S("en-newform", "Форма «Новий супротивник» (приклад, нічого не створює): «За основу» / «Почати з нуля», зображення = токен, назва, категорія з підказками, ОЗ / броня / пси-броня з готовими значеннями, захист, атаки й ходи із заготовок або порожні, аспекти з Посиленнями, примітка; «Створити супротивника» / «Скасувати».", { selector: "#pust-enemy-create", prepare: "enemyCreate", tooltipDirection: "RIGHT" }),
    ],
  },
  {
    // the character sheet, block by block (author, 2026-11-16: two tours instead of «Персонажі й караван»)
    id: "gm-char", gm: true, next: ["gm-caravan"], title: "Аркуш персонажа", description: "",
    steps: [
      S("bar", "Аркуш персонажа: Create Actor → «Персонаж», «Швидкий старт»; згортка «Аркуш»: .json, «Випадковий персонаж», «Очистити аркуш», «Як створити персонажа».", { selector: `${CHAR} .pust-sheetbar-btns`, prepare: ["closeAll", "sheet:character", `open:${CHAR} details.pust-sheetbar`], tooltipDirection: "DOWN" }),
      S("head", "Шапка: портрет, ім'я, архетип, вид, стать; Концепція / Проблема / Ціль / Деталь з кістками; вписане вручну кістки не перекидають.", { selector: `${CHAR} .pust-head`, tooltipDirection: "RIGHT" }),
      S("quick", "«Швидкий доступ»: ОЗ, броня, жетони Долі, Припаси, кришки, ОД, ситуативні аспекти; «Вилікувати / Поповнити за N(к)»; «Зробити перевірку».", { selector: `${CHAR} .pust-qgrid`, tooltipDirection: "DOWN" }),
      S("status", "«Статуси й відпочинок»: статуси; «Відпочити», «Кінець сцени», «Новий день», «Кінець сесії».", { selector: `${CHAR} .pust-qstat`, tooltipDirection: "DOWN" }),
      S("build", "«Атрибути й навички»: вільні пункти, стартові навички, «Заповнити за архетипом»; «Сповіщення й попередження».", { prepare: `click:${CHAR} [data-tab="build"]`, selector: `${CHAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("perks", "«Перки й особливості»: вибір, «Кинути» за архетипом, видові властивості.", { prepare: `click:${CHAR} [data-tab="perks"]`, selector: `${CHAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("gear", "«Мотлох»: «+ Річ з довідника», «Кинути стартове спорядження»; «У руках» / «Вдягнена»; хімія «Вжити» / «На ціль».", { prepare: `click:${CHAR} [data-tab="gear"]`, selector: `${CHAR} .pust-body > .pust-tools-top`, tooltipDirection: "RIGHT" }),
      S("health", "«Здоров'я»: відпочинок, наслідки (лікування за кришки), хімія й залежності, Припаси, кришки.", { prepare: `click:${CHAR} [data-tab="health"]`, selector: `${CHAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("notes", "«Записи»: «Біографія», «Інші», редактор, зберігається само.", { prepare: `click:${CHAR} [data-tab="notes"]`, selector: `${CHAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("xp", "«Покращення»: ОД, квадрат бере покращення; «Як заробляти ОД».", { prepare: `click:${CHAR} [data-tab="xp"]`, selector: `${CHAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("settings", "Налаштування: «Правила й доповнення» (Пазурі, псионіки, силова броня, Guns, «Вільний режим»), трофеї; «Ручні надбавки», «Захист вручну» лише у вільному режимі.", { prepare: `click:${CHAR} [data-tab="settings"]`, selector: `${CHAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("compact", "Компактний режим (крок сам перемикає аркуш і повертає його вигляд): перемикач «Повний / Компактний»; для гри за столом — швидкий доступ, «Перки та особливості» з «Застосувати», хімія, мотлох; створення й налаштування в повному аркуші.", { prepare: ["sheet:character", "compactDemo:character"], selector: `${CHAR}:has(.pust-compact)`, tooltipDirection: "RIGHT" }),
      S("builders", "Create Item: конструктори «Вид» і «Наркотик».", { selector: '#items .create-entry', prepare: ["closeAll", "sidebar:items"], tooltipDirection: "LEFT" }),
    ],
  },
  {
    // the caravan sheet, block by block (author, 2026-11-16)
    id: "gm-caravan", gm: true, next: [], title: "Аркуш каравану", description: "",
    steps: [
      S("bar", "Аркуш каравану: Create Actor → «Караван», «Останній Шанс» у «Швидкому старті»; згортка «Аркуш».", { selector: `${CAR} .pust-sheetbar-btns`, prepare: ["closeAll", "sheet:caravan", `open:${CAR} details.pust-sheetbar`], tooltipDirection: "DOWN" }),
      S("head", "Шапка: назва, «Удача партії» (кидок), транспорт «Браміни» / «Тачка», «Карма» −100…+100, «Репутація».", { selector: `${CAR} .pust-head`, tooltipDirection: "RIGHT" }),
      S("quick", "«Швидкий доступ»: ОЗ, броня, «Бюджет кришок», стан, «Відремонтувати за N(к)» (5 ОЗ за кришку).", { selector: `${CAR} .q-all`, tooltipDirection: "DOWN" }),
      S("range", "«Запас ходу»: поділки, «Поповнити за N(к)» (3 за кришку), «Витрачати автоматично».", { selector: `${CAR} .q-move`, tooltipDirection: "DOWN" }),
      S("imps", "«Покращення»: вибір, два випадкові кістками, «+ Власне покращення», «Турель» з шкодою й «Завдати цілям».", { prepare: `click:${CAR} [data-tab="imps"]`, selector: `${CAR} .pust-imp-bar`, tooltipDirection: "RIGHT" }),
      S("cargo", "«Вантаж і пасажири»: рядки, тип, ціна, к-сть, «Далека» / «Пошк.», «Сума продажу», вантаж угорі; приклад у копії в пам'яті.", { prepare: "cargoDemo", selector: `${CAR}.pust-demo-cargo .pust-body`, tooltipDirection: "RIGHT" }),
      S("story", "«Історія»: знайомство, обличчя компанії, остання справа, що пішло не так, примітки.", { prepare: `click:${CAR} [data-tab="story"]`, selector: `${CAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("settings", "Налаштування: «Надбавки» (ОЗ, броня, пси-броня, турель), «Захист» від типів; порожнє — за правилами.", { prepare: `click:${CAR} [data-tab="settings"]`, selector: `${CAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("compact", "Компактний режим (крок сам перемикає аркуш і повертає його вигляд): перемикач «Повний / Компактний»; у дорозі — швидкий доступ на сталевій панелі, «Покращення» над «Вантажем», вантаж чипами; створення й налаштування в повному аркуші.", { prepare: ["sheet:caravan", "compactDemo:caravan"], selector: `${CAR}:has(.pust-compact)`, tooltipDirection: "RIGHT" }),
      S("done", "Кінець ланцюжка Доглядача; гравці отримають свій тур; «Довідка Foundry».", {  }),
    ],
  },

  /* ================================ Гравець ================================ */
  {
    id: "pl-character", first: true, next: ["pl-sheet"], title: "Твій персонаж", description: "",
    steps: [
      S("hello", "Вітання гравця: короткий тур, × виходить, повторити — журнал «Довідка Foundry».", { prepare: ["closeAll", "sheet:pc"] }),
      // author, 2026-11-16: the old «Створення» split in three — the bar's buttons, name / archetype / species, the aspects
      S("bar", "Згортка «Аркуш»: п'ять кнопок з іконками — .json, «Випадковий персонаж», «Очистити аркуш», «Як створити персонажа»; у «Швидкого старту» частина вимкнена.", { selector: `${CHAR} .pust-sheetbar-btns`, prepare: ["sheet:pc", `open:${CHAR} details.pust-sheetbar`], tooltipDirection: "DOWN",  }),
      S("who", "Ім'я, архетип, вид, стать: що робить кожне поле і навіщо архетип і вид за правилами.", { selector: `${CHAR} .pust-who-id`, prepare: "sheet:pc", tooltipDirection: "RIGHT" }),
      S("asp", "Концепція, Проблема, Ціль: питання кожного аспекту, ЖД за нав'язування й ОД наприкінці сесії.", { selector: `${CHAR} .pust-who-asp`, prepare: "sheet:pc", tooltipDirection: "RIGHT" }),
      S("hp", "ОЗ і броня: −/+, «Вилікувати за N(к)»; правила максимуму ОЗ, 0 ОЗ і наслідки, броня.", { selector: `${CHAR} .q-life`, tooltipDirection: "DOWN" }),
      S("fate", "Жетони Долі: −/+ і картка в чаті; скільки на сесію, на що витрачати, жетон за 0 ОЗ.", { selector: `${CHAR} .q-fate`, tooltipDirection: "DOWN" }),
      S("goods", "Припаси (лампочки, «Поповнити за N(к)») і кришки; що покривають Припаси, ціни.", { selector: `${CHAR} .q-goods`, tooltipDirection: "DOWN" }),
      S("xpq", "«Зароблено ОД»: −/+ і «лишилося»; за що дають ОД.", { selector: `${CHAR} .q-xp`, tooltipDirection: "DOWN" }),
      S("situ", "Ситуативні аспекти: додати, швидкі аспекти, безкоштовні Посилення −/+, ×; звідки беруться.", { selector: `${CHAR} .pust-qsit`, tooltipDirection: "DOWN" }),
      S("rest", "«Статуси й відпочинок»: статуси від виду, перків, особливостей і речей; «Відпочити», кінець сцени, дня, сесії.", { selector: `${CHAR} .pust-qstat`, tooltipDirection: "UP" }),
    ],
  },
  {
    // every tab of the character sheet, each with its rules (author, 2026-11-16: split from «Твій персонаж»)
    id: "pl-sheet", next: ["pl-check"], title: "Вкладки аркуша", description: "",
    steps: [
      S("build", "«Атрибути й навички»: пункти, межі виду, стартові навички, «Заповнити за архетипом»; кістка навички.", { prepare: ["closeAll", "sheet:pc", `click:${CHAR} [data-tab="build"]`], selector: `${CHAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("issues", "«Сповіщення й попередження»: приклад блоку над вкладками; жовте нагадує, червоне — порушення правил; зникає сам.", { prepare: [`click:${CHAR} [data-tab="build"]`, "issuesDemo"], selector: `${CHAR} .pust-issues`, tooltipDirection: "DOWN" }),
      S("perks", "«Перки й особливості»: кількість на старті, вимоги, «Кинути», «+ Свій», видові властивості.", { prepare: `click:${CHAR} [data-tab="perks"]`, selector: `${CHAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("gear", "«Мотлох»: довідник, стартове спорядження, у руках / вдягнена, важкі речі, хімія «Вжити» / «На ціль»; приклад зі стимпаком у копії в пам'яті.", { prepare: ["sheet:pc", "gearDemo"], selector: `.pust-demo-gear .pust-gear-cols`, tooltipDirection: "RIGHT" }),
      S("health", "«Здоров'я»: відпочинок, наслідки й лікування, хімія, залежність і ломка.", { prepare: `click:${CHAR} [data-tab="health"]`, selector: `${CHAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("notes", "«Записи»: «Біографія» і «Інші», редактор, зберігається само.", { prepare: `click:${CHAR} [data-tab="notes"]`, selector: `${CHAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("xp", "«Покращення»: ОД, квадрати, лише наприкінці сесії; «Як заробляти ОД».", { prepare: `click:${CHAR} [data-tab="xp"]`, selector: `${CHAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("settings", "Налаштування: правила, які дозволяє Доглядач, доповнення, вільний режим, трофеї.", { prepare: `click:${CHAR} [data-tab="settings"]`, selector: `${CHAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("compact", "Компактний режим (крок сам перемикає аркуш і повертає його вигляд): перемикач «Повний / Компактний»; для гри за столом — швидкий доступ, «Перки та особливості» з «Застосувати», хімія, мотлох; створення й налаштування в повному аркуші.", { prepare: ["sheet:pc", "compactDemo:character"], selector: `${CHAR}:has(.pust-compact)`, tooltipDirection: "RIGHT" }),
    ],
  },
  {
    id: "pl-check", next: ["pl-panels"], title: "Зробити перевірку", description: "",
    steps: [
      S("button", "«Зробити перевірку» на аркуші й панелі; коли кидати за правилами.", { selector: `${CHAR} .pust-check-btn`, prepare: ["closeAll", "sheet:pc"], tooltipDirection: "LEFT" }),
      S("attr", "Атрибут і навичка; кістка навички замінює меншу.", { selector: ".pust-demo-check .rgrp:has(.rats), .pust-demo-check .rgrp:has(#r-skill)", union: true, prepare: ["closeAll", "checkDemo:roll"], tooltipDirection: "RIGHT" }),
      S("type", "«Стандартні дії»: як читається результат (атрибут і навичка не змінюються); повторний клік — звичайна перевірка.", { selector: ".pust-demo-check .rpre.pust-std", prepare: "checkDemo:roll", tooltipDirection: "RIGHT" }),
      S("presets", "Готові перевірки й «Перевірка подорожі».", { selector: ".pust-demo-check .rpre.rgr:not(.pust-std), .pust-demo-check .travelb", union: true, prepare: "checkDemo:roll", tooltipDirection: "RIGHT" }),
      S("perks", "Перки з власною перевіркою.", { selector: ".pust-demo-check .rpre.psi", prepare: "checkDemo:roll", tooltipDirection: "RIGHT" }),
      S("mods", "Посилення, Послаблення, Модифікатор за правилами.", { selector: ".pust-demo-check .rmods", prepare: "checkDemo:roll", tooltipDirection: "RIGHT" }),
      S("roll", "«Кинути перевірку»: картка в чаті.", { selector: ".pust-demo-check .rgo", prepare: "checkDemo:roll", tooltipDirection: "RIGHT" }),
      S("result", "Результат: вердикт, сума з діапазонами, кістки, що означає для виду; діапазони за правилами, ОД за невдачу.", { selector: ".pust-demo-check .rres > :is(.rdice, .rvhead, .rverd, .rdesc)", union: true, prepare: "checkDemo:roll", tooltipDirection: "RIGHT" }),
      S("aspects", "Виклик аспекту після кидка: +1d10, чим платиться, коли не можна.", { selector: ".pust-demo-check .rasp", prepare: "checkDemo:roll", tooltipDirection: "RIGHT" }),
      S("effects", "Ефекти атаки: що дає кожен результат.", { selector: ".pust-demo-check .rfx", prepare: "checkDemo:roll", tooltipDirection: "RIGHT" }),
      S("apply", "«Завдати шкоди»: чипи зброї, цілі T, броня й захисти, цілі знімаються; без цілей кнопка неактивна.", { selector: ".pust-demo-check .rdmg", prepare: "checkDemo:roll", tooltipDirection: "RIGHT" }),
      S("damage", "Шкода: колір типу, сума, кістки, картки в чаті, критичний ефект.", { selector: ".pust-demo-check .rdmg", prepare: "checkDemo:dmg", tooltipDirection: "RIGHT" }),
    ],
  },
  {
    id: "pl-panels", next: ["pl-battle"], title: "Твої панелі", description: "",
    steps: [
      S("check", "«Зробити перевірку» на панелі: те саме вікно під кнопкою, за твого персонажа.", { selector: `${DOCK} .pust-md-check, #pust-check-dock`, union: true, prepare: ["closeAll", "scene:map", "dockDemo", "dockCheck"], tooltipDirection: "RIGHT" }),
      S("dice", "«Кістки»: N×d6/d8/d10/dN у чат.", { selector: `${DOCK} [data-unit="dice"]`, prepare: "unfold:dice", tooltipDirection: "LEFT",  }),
      S("fate", "«Доля»: кістка Долі за свого персонажа; за іншого — познач його ціллю (T).", { selector: `${DOCK} [data-mapdice="fate"]`, tooltipDirection: "LEFT",  }),
      S("fd", "«Витратити ЖД» / «Отримати ЖД»: лічильник персонажа й картка в чаті.", { selector: `${DOCK} .pust-md-fdspend:not(.pust-md-supspend)`, prepare: "dockDemo", tooltipDirection: "LEFT",  }),
      S("sup", "«Витратити Припас» / «Отримати Припас».", { selector: `${DOCK} .pust-md-supspend`, prepare: "dockDemo", tooltipDirection: "LEFT",  }),
      S("ctr", "«Лічильники»: що зараз рахує Доглядач (лише читати); приклади лічильника гри й сцени.", { selector: `${DOCK} .pust-md-ctr`, prepare: "counterDemo", tooltipDirection: "RIGHT" }),
      S("note", "«Примітка» праворуч від кнопок Foundry (не на бойовій мапі): стікер гравця; підпис, правка будь-якого видимого стікера, розмір за кут.", { selector: `${DOCK} .pust-md-note`, prepare: "sceneKind:map", tooltipDirection: "RIGHT" }),
    ],
  },
  {
    id: "pl-battle", scene: "battle", next: ["pl-caravan"], title: "Бій", description: "",
    steps: [
      S("zones", "Зона з аспектами (рамка над зоною сцени): що таке зони, взаємодія в зоні, переміщення, атаки на відстані, аспекти зон.", { prepare: ["closeAll", "scene:battle", "zoneFrame:zone"], selector: ".pust-zone-frame", tooltipDirection: "RIGHT" }),
      S("token", "Токен персонажа (приклад на сцені, лише в пам'яті): смужка ОЗ, ім'я, чипи ситуативних аспектів, спалах і число при зміні ОЗ, Unconscious на 0.", { prepare: "tokenDemo", selector: ".pust-tok-demo", tooltipDirection: "RIGHT" }),
      S("round", "Коло дій (приклад картки в чаті): переміщення й дія, хід Доглядача наприкінці кола.", { prepare: "roundDemo", selector: ".pust-demo-msg", tooltipDirection: "LEFT" }),
      S("target", "«Обрати цілі» / «Зняти цілі»: навіщо цілі, токени не тягнуться.", { selector: `${DOCK} .pust-md-trow`, tooltipDirection: "DOWN" }),
      S("targetlook", "Як виглядає ціль (токен сцени, позначений для кроку).", { prepare: "targetDemo", selector: ".pust-tgt-demo", tooltipDirection: "RIGHT" }),
      S("all", "«Обрати всіх» на смужці зони (рамка): цілі — всі в зоні; вдруге — зняти; атаки по всій зоні.", { prepare: "zoneFrame:target", selector: ".pust-zone-frame", tooltipDirection: "DOWN" }),
      S("hit", "Атака: правила атаки в бою, «Завдати шкоди» (приклад вікна перевірки), шкода через Доглядача.", { prepare: "checkDemo:roll", selector: ".pust-demo-check .rdmg", tooltipDirection: "RIGHT" }),
      S("dodge", "Уникнення шкоди: коли, які атрибути, результати (приклад вікна перевірки).", { prepare: "checkDemo:roll", selector: ".pust-demo-check .rpre.rgr:has(.dodge)", tooltipDirection: "RIGHT" }),
      S("enemy", "Картка ворога для гравця: стан словом і ситуативні аспекти, які можна викликати.", { prepare: "sheet:enemy", selector: `${EN}`, tooltipDirection: "RIGHT" }),
      S("chem", "Хімія «На ціль» (приклад зі стимпаком): одна ціль, доза своя, дія за правилами цілі.", { prepare: ["sheet:pc", "gearDemo"], selector: ".pust-demo-gear .pust-use-tgt", tooltipDirection: "RIGHT" }),
    ],
  },
  {
    // the caravan for the players, with its rules, its token and the range spent on the map (author, 2026-11-16)
    id: "pl-caravan", scene: "map", next: [], title: "Караван", description: "",
    steps: [
      S("head", "Шапка: Удача партії (кістка Долі групи), «Браміни» / «Тачка» з їхніми правилами, карма й репутація як аспекти групи.", { selector: `${CAR} .pust-head`, prepare: ["closeAll", "sheet:caravan"], tooltipDirection: "RIGHT" }),
      S("quick", "Швидкий доступ: ОЗ і броня каравану, бюджет компанії, вантаж страждає після половини ОЗ, ремонт за кришки.", { selector: `${CAR} .q-all`, tooltipDirection: "DOWN" }),
      S("range", "Запас ходу: клітинка за одиницю, тачка три, 10 на старті, поповнення за кришки, перевірка подорожі за 5 клітинок.", { selector: `${CAR} .q-move`, tooltipDirection: "DOWN" }),
      S("imps", "Покращення: два на старті, що вони дають.", { prepare: `click:${CAR} [data-tab="imps"]`, selector: `${CAR} .pust-imp-bar`, tooltipDirection: "RIGHT" }),
      S("cargo", "Вантаж і пасажири (приклад у копії в пам'яті): місткість 10 кришок, ціни продажу, далека доставка, пошкоджений вантаж.", { prepare: "cargoDemo", selector: `${CAR}.pust-demo-cargo .pust-body`, tooltipDirection: "RIGHT" }),
      S("story", "Історія компанії: знайомство, обличчя компанії, остання справа, що пішло не так.", { prepare: `click:${CAR} [data-tab="story"]`, selector: `${CAR} .pust-body`, tooltipDirection: "RIGHT" }),
      S("compact", "Компактний режим (крок сам перемикає аркуш і повертає його вигляд): перемикач «Повний / Компактний»; у дорозі — швидкий доступ на сталевій панелі, «Покращення» над «Вантажем», вантаж чипами; створення й налаштування в повному аркуші.", { prepare: ["sheet:caravan", "compactDemo:caravan"], selector: `${CAR}:has(.pust-compact)`, tooltipDirection: "RIGHT" }),
      S("token", "Токен каравану на мапі: смужки ОЗ і «Запас ходу», картинка за транспортом.", { prepare: ["closeAll", "caravanToken"], selector: ".pust-tok-demo", tooltipDirection: "RIGHT" }),
      S("move", "Рух мапою: питання про списання запасу ходу (приклад на 5 клітинок, нічого не рухається).", { prepare: "moveDemo", selector: ".pust-cmove-demo", tooltipDirection: "RIGHT" }),
    ],
  },
];

// the texts live in tour-texts.mjs (author, 2026-11-16)
for (const t of TOURS) {
  t.description = TOUR_DESCRIPTIONS[t.id] ?? t.description;
  for (const step of t.steps) Object.assign(step, TOUR_TEXTS[`${t.id}__${step.id}`] ?? {});
  // a tour that needs a kind of scene: every step makes sure of it first (after its own closeAll)
  if (t.scene) for (const step of t.steps) {
    const list = [step.prepare ?? []].flat();
    const at = list[0] === "closeAll" ? 1 : 0;
    list.splice(at, 0, `sceneKind:${t.scene}`);
    step.prepare = list;
  }
}

/**
 * A step's text for the journal (author, 2026-11-17): what speaks of the tour's own examples («Тут показано приклад…»,
 * `<span class="pust-tour-only">`) is left out; a paragraph left empty goes too
 */
export function journalText(html) {
  return String(html)
    .replace(/\s?<span class="pust-tour-only">[\s\S]*?<\/span>/g, "")
    .replace(/<p>\s*<\/p>/g, "");
}
