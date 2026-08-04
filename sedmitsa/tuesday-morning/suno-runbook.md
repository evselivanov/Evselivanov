# ОПЕРАТОРСКИЙ РАНБУК: Suno, «Пока не зайдёт солнце» (вторник утро)
Для исполнителя: Claude for Chrome (в браузере автора) или человек.
Аккаунт: lessve / Lessve, suno.com, модель v5.5, вкладка Advanced.
Правило №1: тексты вставлять ДОСЛОВНО из блоков ниже, ничего не менять и не сокращать.
Правило №2: перед каждым Create проверять, что «Instrumental» ВЫКЛЮЧЕНА.
Правило №3: не нажимать чипы-подсказки под полем Styles.

## ЭТАП 1. Достроить трек «Пока не зайдёт солнце полный 1» (6:43)

Трек в Library. Он оборвался, не допев текст с [Outro] до конца.

1. Открыть трек → Remix/Edit → **Extend**.
2. Точка продолжения: конец последней СПЕТОЙ фразы (слушать последние ~40 сек; ставить
   точку в паузе после фразы, не на слове). Ожидаемо это конец бриджа
   «...и о цАрстве небЕсном — не позабОтился» (~6:2x).
3. В Lyrics для продолжения вставить БЛОК A (ниже). Если трек оборвался раньше и не спел
   и бридж «чтО же сотворЮ...» — добавить в начало блока и его (взять из
   part1-production-markup.txt).
4. Styles не трогать (наследуется). Создать 2-3 варианта продолжения.
5. Выбрать вариант без слышимого шва и со стабильным голосом → **Get Whole Song**.
6. Скачать итог в MP3. Имя: «Пока не зайдёт солнце I ПОЛНАЯ».

### БЛОК A (остаток части I для Extend)

```
[Outro]
[quiet litany]
не презрИ менЯ — проповЕдник христОв —
чЕстный предтЕча — послЕдний прорОк —
пЕрвый мУченик — настАвник постЯщихся —
учИтель чистотЫ — вЕчный дрУг — и срОдник христОв.
тебЯ молЮ — и к тебЕ припадАю...
не лишИ менЯ — защИты твоЕй...
но под-ни-мИ менЯ — убОгого — пАвшего во мнОгих грехАх.
[beat cuts to silence]

[Chorus]
[fullest chant, echoes]
по-кА не зай-дЁт сОлн-це... (сОлнце...)
по-кА не объ-Я-ла нОчь... (нОчь...)
[stop-time, voice alone]
про-тя-нИ мне рУ-ку пО-мо-щи...
[beat returns, voice rises]
под-ни-мИ ме-нЯ... из тьмЫ... (из тьмЫ...)
об-но-вИ дУ-шу мо-Ю — по-ка-Я-ни-ем... (покаЯнием...)
ибО покаЯние — вторОе крещЕние.
[quieter]
ибО ты — начАло обОих...
крещЕнием омывАешь — грехИ прародИтельные...
покаЯнием очищАешь — сквЕрну душЕвную.
очИсти менЯ — грЕшника...
устА недостОйные — взывАют к тебЕ...
душА сквЕрная — мОлится...
сЕрдце нечИстое — из глубинЫ — воздыхАет.

[Coda]
[dry whisper, no instruments]
спасИ менЯ — от врагОв моИх...
да не удЕржат дУшу моЮ — лукАвые бЕсы — пОсле смЕрти...
да не скАжут онИ...
[silence]
вот дЕнь... котОрого мы ждАли.
[end]
```

## ЭТАП 2. Попытка бесшовного продолжения в часть II

После успешного этапа 1 попробовать ещё один Extend от конца полной части I
(точка — после «вот дЕнь... котОрого мы ждАли», в тишине).
В Lyrics вставить текст ЧАСТИ II ЦЕЛИКОМ из full-lyrics-no-cuts.md (блок «ЧАСТЬ II»).
- Если Suno принял и генерирует — продолжать цепочку экстендов, пока не прозвучит
  всё до «амИнь. [end]». Затем Get Whole Song → скачать MP3 «Пока не зайдёт солнце ПОЛНАЯ МОЛИТВА».
- Если Suno отказал (лимит длины) → ЭТАП 3.

## ЭТАП 3 (запасной). Часть II отдельным треком

1. Create (новый трек, НЕ Extend). Персона: «утро вторник в продакшн».
2. Title: `Пока не зайдёт солнце. II`
3. Styles (973 симв., дословно):
```
Dark 90s Bristol trip-hop, 68-72 BPM, A minor. Male vocals only: weary, low, penitential voice, half-spoken recitative close to the mic — exhausted, humble, not raspy. Chorus: low chanted incantation locked to the beat, whispered echo answers, a three-note falling cello riff between lines, one rising held note on the last line — the only melodic lift. Sparse fingerpicked nylon acoustic guitar, single dry intimate notes. One mournful cello, long low notes in bridges and darkest verse. Bass: restrained, sustained, soft attack, like slow breathing — no staccato, no punchy hits. Drums: minimal, dusty, soft muffled kick. The track must breathe: full-bar rests of true silence, the mix drops to nothing before each chorus. Verses on a static drone, chorus on a descending Andalusian cadence Am-G-F-E. Vinyl crackle, tape hiss. Penitential, liturgical, confessional. Russian vocals. Short intro, first chorus within 45 seconds. No piano, no orchestra, no electric guitar.
```
4. Exclude styles:
```
ballad, power ballad, pop, EDM, dance, upbeat, bright synths, four-on-the-floor, trap, stadium rock, metal, opera, orchestral, gospel choir, country, female vocals, soaring vocals, emotional singing, aggressive bass, punchy bass, hard kick, distorted vocals, dark rap, electric guitar, piano, violin, string section, cinematic orchestra
```
5. Vocal Gender: Male. Weirdness 40%. Style Influence 80%. Audio Influence 50%. Duration Auto.
6. Lyrics: текст ЧАСТИ II из full-lyrics-no-cuts.md (актуальная версия: с «трАпезы»,
   «ибО числА», без растяжек гласных).
7. Сгенерировать 3-4 дубля. Если трек оборвётся, не допев текст — достроить Extend'ом
   по аналогии с этапом 1 (вставлять неспетый остаток).
8. Скачать лучший в MP3.

## ЧЕК-ЛИСТ приёмки любого результата

1. Спет ВЕСЬ текст (сверить по лирике на странице трека — ни одна строка не пропущена).
2. Голос узнаётся (Персона B, не «поплыл»), без хрипа-«героина».
3. Бас тянется, не «стреляет»; ударные приглушены.
4. Припев — чант с эхом, не запел балладой.
5. Швы Extend не слышны (нет скачка громкости/тембра на стыке).
6. Темп ~70, характер части II совпадает с частью I.

## Что принести на анализ (в сессию Claude Code)

MP3 всех финальных файлов (не WAV — лимит загрузки 30 МБ). Ассистент сверит полноту текста
построчно, проверит спектр/паузы/швы и решит, что нужно на мастеринге.
