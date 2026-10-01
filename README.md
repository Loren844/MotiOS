# MotiOS

MotiOS is an iPhone assistant for Pokemon GO. It receives raw text read from a screenshot, identifies the Pokemon and its CP, then displays the possible IVs in a Scriptable window.

The result is a range, not a definitive value: HP, level, or the in-game appraisal are required to remove the ambiguity.

## V1 Features

- Extracts the Pokemon name and CP from raw OCR text, then calculates possible IVs.
- Narrows results to realistic wild encounters: whole levels only, capped at your trainer level up to 30.
- Applies the weather-boost rules: levels shifted by 5 and an IV floor of 4.
- Supports fixed-level encounters such as raids, research, and Team GO Rocket, where the level is known exactly.
- Recognizes Alolan, Galarian, Hisuian, and Paldean forms so the correct base stats are used.
- Reports the odds of IVs at or above 80%, 90%, and 100% instead of an undecidable range.
- Recognizes official names in every language in the PokeAPI catalog, including French.
- French interface by default and English interface with `"locale":"en"`.
- Pokemon GO stats refresh daily and the name catalog is cached for 30 days.
- Works offline after both caches have loaded once.

## iPhone Installation

### 1. Install Scriptable

1. Open the App Store on your iPhone and install the free **Scriptable** app.
2. Open it once to let iOS finish configuring it.

### 2. Add the two scripts

1. In Scriptable, tap `+`, name the script exactly `iv-calculator`, then paste the contents of [src/iv-calculator.js](src/iv-calculator.js). Tap `Done`.
2. Tap `+` again, name the script exactly `MotiOS`, then paste the contents of [scriptable/MotiOS.js](scriptable/MotiOS.js). Tap `Done`.
3. Run `MotiOS` once. Enter, for example, `Pikachu` and `523`. This first run authorizes network access and populates the caches. The name can also be entered in French or another official language.

### 3. Connect your existing iOS Shortcut

Your Shortcut must obtain the raw text with iOS OCR. MotiOS extracts the Pokemon name and CP itself.

1. After the action that analyzes the screenshot, keep the complete OCR text.
2. Add Scriptable's `Run Script` action.
3. Select the `MotiOS` script.
4. Pass the OCR text directly to the Scriptable action's `Parameter` field. MotiOS also accepts JSON with a `text` property.
5. Test with this OCR text:

```text
Pikachu
PC 523
```

For the English interface, pass JSON such as `{"text":"Pikachu\nCP 523","locale":"en"}`. Without `locale`, the interface is in French.

### 4. Set your trainer level

MotiOS assumes you are trainer level 30 or above, which is exact because wild encounters never exceed level 30.

If you are below level 30, you must set your real level, otherwise MotiOS keeps levels you cannot actually encounter. Pass `trainerLevel` in the JSON; the value is stored in the Scriptable keychain and reused until you change it:

```json
{"text":"Pikachu\nPC 523","trainerLevel":24,"weatherBoost":true}
```

Set `weatherBoost` to `true` when the encounter shows the weather-boost swirl. This both shifts the level window by 5 and raises the IV floor to 4, which sharply narrows the result.

### 5. Optional: declare the encounter type

For anything that is not a wild spawn, pass `source` to pin the level exactly. This is by far the largest precision gain.

| `source` | Level | IV floor |
| --- | --- | --- |
| `wild` (default) | 1 to 30 | 0, or 4 when boosted |
| `raid` | 20, or 25 boosted | 10 |
| `research` | 15 | 10 |
| `egg` | trainer level, up to 20 | 10 |
| `rocket` | 8, or 13 boosted | 0, or 4 when boosted |
| `giovanni` | 8, or 13 boosted | 6 |
| `gbl` | 20 | 10 |
| `max` | 20 | 10 |

### 6. Assign the Action Button

In **Settings > Action Button**, choose **Shortcut**, then select your MotiOS Shortcut. Pressing the button captures the screen, runs your OCR, and displays the result.

## Reading the result

CP alone can never identify a single IV spread before catching, so MotiOS reports probabilities instead of a false certainty. All surviving level and IV combinations are equally likely, so the displayed share is the actual chance given the CP you scanned.

Use `Chance IV >= 80 %` as the decision value. Above 50% MotiOS suggests keeping, below 10% it suggests skipping.

For a definitive IV spread you still need the HP, the level, or the in-game appraisal after catching.

## OCR Tips

Pass the complete OCR text to MotiOS. It recognizes the CP labels `PC` and `CP`, then searches each OCR line against the multilingual official-name catalog.

French names such as `Pikachu`, `Salameche`, or `M. Mime` are supported, as are official names from the other languages included in PokeAPI. Regional forms are detected from the words `Alola`, `Galar`, `Hisui`, and `Paldea`. Costumes and other special forms remain a known limitation.

## Maintenance and Local Testing

MotiOS uses PvPoke stats and the PokeAPI name catalog. If either source changes, delete `motios-gamemaster.json` and `motios-species-names.json` from Scriptable's folder to force the next download.

When Node.js is installed on a computer, run:

```powershell
node test/iv-calculator.test.js
```
