# MotiOS

MotiOS is an iPhone assistant for Pokemon GO. It receives the name and CP read from a screenshot, then displays the possible IVs in a Scriptable window.

The result is a range, not a definitive value: HP, level, or the in-game appraisal are required to remove the ambiguity.

## V1 Features

- Calculates possible IVs from the name and CP.
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

Your Shortcut must ultimately produce two values: the name read by OCR and the CP read by OCR.

1. After the action that analyzes the screenshot, create a `Dictionary` with `name` and `cp` keys.
2. Add Scriptable's `Run Script` action.
3. Select the `MotiOS` script.
4. Pass the dictionary to the Scriptable action's `Parameter` field. MotiOS also accepts JSON if your Shortcut already produces it.
5. Test with this JSON:

```json
{"name":"Pikachu","cp":523,"locale":"fr"}
```

For the English interface, replace `"locale":"fr"` with `"locale":"en"`. Without `locale`, the interface is in French.

### 4. Assign the Action Button

In **Settings > Action Button**, choose **Shortcut**, then select your MotiOS Shortcut. Pressing the button captures the screen, runs your OCR, and displays the result.

## OCR Tips

The Shortcut must pass only the name and an integer CP value. To extract CP from OCR text, use the regular expression `(?:PC|CP)\s*(\d+)`.

French names such as `Pikachu`, `Salameche`, or `M. Mime` are supported, as are official names from the other languages included in PokeAPI. Regional forms, costumes, and other special forms remain a known V1 limitation because they may use different stats.

## Maintenance and Local Testing

MotiOS uses PvPoke stats and the PokeAPI name catalog. If either source changes, delete `motios-gamemaster.json` and `motios-species-names.json` from Scriptable's folder to force the next download.

When Node.js is installed on a computer, run:

```powershell
node test/iv-calculator.test.js
```