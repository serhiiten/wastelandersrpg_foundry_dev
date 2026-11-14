# Пустельники для Foundry VTT — DEV

> **Тестова збірка.** Система має окремий ID `wastelanders-dev` і ставиться поруч зі стабільною, не зачіпаючи ваших світів. Для тестів створіть новий світ із системою «Пустельники (DEV)».
>
> Manifest URL: https://raw.githubusercontent.com/serhiiten/wastelandersrpg_foundry_dev/main/system.json
>
> Повернення до стабільного ID перед релізом: `node tools/set-system-id.mjs wastelanders`.

[![Foundry Shield]][Foundry URL]
[![Version]][Version URL]
[![GNU License]][GNU URL]

Система для [Пустельників](https://sergeyten.notion.site/21de66cd8c78803186b2e9a38f160a4f).

## Встановлення

Щоб встановити цю систему:

1. Усередині екрану "Configuration and Setup" лаучера натисніть "Systems".
2. Натисніть "Install System".
3. В полі "Manifest URL" вставте наступне посилання: https://raw.githubusercontent.com/serhiiten/wastelandersrpg_foundry_dev/main/system.json
4. Натисніть 'Install' і дочекайтеся завершення встановлення.

Тепер ви можете створити світ з цією системою і використовувати аркуші персонажів та компендіуми для неї у Foundry VTT!

[Foundry Shield]: https://img.shields.io/badge/Foundry-14-orange?style=flat-square
[Foundry URL]: https://foundryvtt.com

[Version]: https://img.shields.io/badge/Version-1.1.0-dev.12-informational?style=flat-square
[Version URL]: https://github.com/serhiiten/wastelandersrpg_foundry_dev/releases/tag/v1.1.0-dev.12

[GNU License]: https://img.shields.io/badge/License-GNU-green?style=flat-square
[GNU URL]: https://github.com/serhiiten/wastelandersrpg_foundry/blob/main/LICENSE.md

## Розробка: компендіуми

Компендіуми зберігаються у двох видах: `packs/` (база даних Foundry, йде в реліз) і `src/packs/` (JSON-вихідники для перегляду змін у git).

- Змінили компендіум у Foundry → закрийте Foundry і виконайте `npm run packs:unpack`, потім закомітьте обидві теки.
- Змінили JSON вручну → виконайте `npm run packs:pack`.

Перед першим запуском: `npm install`.
