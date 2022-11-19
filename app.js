//  ---------------- Function definitions ------------------

// Save current state of the data object to the browser's local storage as JSON
function saveData(name, data) {
    localStorage.setItem(name, JSON.stringify(data));
}

/* Check if the structure of the data object stored as JSON in the browser's
local storage matches the structure of current default data object. */
function checkStoredData(loadedData, defaultData) {
    var keysLoaded = Object.keys(loadedData),
        keysDefault = Object.keys(defaultData);
    return keysLoaded.length === keysDefault.length &&
        keysLoaded.every(k => defaultData.hasOwnProperty(k) && (
            loadedData[k] && loadedData[k].constructor == Object ||
                defaultData[k] && defaultData[k].constructor == Object
                ? checkStoredData(loadedData[k], defaultData[k])
                : true));
}

/* Load the data object stored as JSON in the browser's local storage as a repacement
for the default data boject */
function loadData(name) {
    var loaded = JSON.parse(localStorage.getItem(name));
    return loaded
}

/* Generate the "bag" of tokens - an array with one object per token in the bag whose
draw probabilities are to be calculated */
function makeBag(tokens) {
    var bag = []
    for (const [token_name, token] of Object.entries(tokens)) {
        for (let i = 1; i <= token["count"]; i++) {
            bag.push({
                "value": token["value"],
                "redraw": token["redraw"],
                "name": token_name,
                "autofailAfter": token["autofailAfter"],
                "autofail": token["autofail"]
            })
        }
    };
    return bag
}

/* Go through the active abilities selected, and prepare modifiers to token values based 
on those */
function prepareModifiers(abilitiesActive, abilityEffects, modifiers) {
    for (const [k, v] of Object.entries(modifiers)) {
        modifiers[k] = {};
    };
    if (abilitiesActive.length != 0) {
        abilitiesActive.forEach(function (ability, i) {
            var abilityEffect = abilityEffects[ability];
            for (const [k, v] of Object.entries(abilityEffect)) {
                if (Object.keys(modifiers[k]).length == 0 || abilityEffect[k]["type"] == 's') {
                    modifiers[k] = v
                } else if (modifiers[k]["type"] == 'a') {
                    modifiers[k]["value"] += abilityEffect[k]["value"]
                }
            };
        })
    }
}

// Generate an array of numbers from start value to end value incremented by one
function range(start, end) {
    if (start === end) return [start];
    return [start, ...range(start + 1, end)];
}

/* Calculate the total of drawing a token, potentially after drawing other tokens
and with some set of modifiers to the value */
function calculateTotal(previousTotal, token, modifiers) {
    var total = previousTotal + token["value"];
    if (Object.keys(modifiers[token["name"]]).length != 0) {
        if (modifiers[token["name"]]["type"] == 'a') {
            total += modifiers[token["name"]]["value"]
        } else {
            total = modifiers[token["name"]]["value"]
        }
    }
    return total
}

/* Find the max and min possible totals that the current bag of tokens could results in drawing,
given however many redraws are present */
function getTokenRange(tokens) {
    var max = 0;
    var maxSingle = -999;
    var min = 0;
    var minSingle = 999;
    tokens.forEach(function (v, i) {
        if (v["value"] > 0 && v["redraw"]) {
            max += v["value"]
        } else if (v["value"] < 0 && v["redraw"]) {
            min += v["value"]
        }
        if (v["value"] > maxSingle && !(v["redraw"])) {
            maxSingle = v["value"]
        } else if (v["value"] < minSingle && !(v["redraw"]) && !(v["autofail"])) {
            minSingle = v["value"]
        }
    })

    return [min + minSingle, max + maxSingle];
}

/* What to do if there are more redraws than redrawMax */
function handleTooManyRedraws(total, tokens, handling, autofail_value, resultsTracker, probMod) {
    var tokenRegex = /t(\+|-)\d/;
    if (handling == "autofail") {
        addToResultsTracker(resultsTracker, total, probMod, autofail_value, true);
    } else if (handling == "median") {
        var tokenValues = []
        tokens.forEach(function (token, i) {
            if (!(token["redraw"]) && token["value"] != autofail_value && !(token["autofail"])) {
                tokenValues.push(token["value"])
            }
        });
        var tokenMedian = Math.floor(math.median(tokenValues));
        addToResultsTracker(resultsTracker, total + tokenMedian, probMod, autofail_value, false);
    } else if (handling == "average") {
        var tokenValues = []
        tokens.forEach(function (token, i) {
            if (!(token["redraw"]) && token["value"] != autofail_value && !(token["autofail"])) {
                tokenValues.push(token["value"])
            }
        });
        var tokenAverage = Math.floor(math.mean(tokenValues));
        addToResultsTracker(resultsTracker, total + tokenAverage, probMod, autofail_value, false);
    } else if (tokenRegex.test(handling)) {
        var tokenValue = parseInt(handling.substring(1))
        addToResultsTracker(resultsTracker, total + tokenValue, probMod, autofail_value, false);
    } else {
        console.log("Handling for too many redraws hit an unrecognized 'handling' parameter")
    }
}

/* Handle the final result of a draw */
function addToResultsTracker(resultsTracker, total, probMod, autofailValue, isAutofail) {
    if (total == autofailValue || isAutofail) {
        //pass
    } else if (total > 1) {
        resultsTracker[2] += probMod * 100;
    } else if (total == 1) {
        resultsTracker[1] += probMod * 100;
    } else if (total >= -8) {
        resultsTracker[total] += probMod * 100;
    }
}

/* Pull a token and resolve its value - called recursively for redraws */
function calculationStep(remainingOptions, previousTotal, probMod, lastDraw, drawCount, autofail_value, redrawMax, resultsTracker, modifiers, redrawHandling) {
    remainingOptions.forEach(function (token, i) {
        // Calculate result, assuming now additional stuff happening
        var total = calculateTotal(previousTotal, token, modifiers)
        if (token["value"] == autofail_value || token["autofail"]) { // Special case so autofail always has same value / to recognize autofail checkbox
            addToResultsTracker(resultsTracker, total, probMod, autofail_value, true)
        } else if (lastDraw && lastDraw == token["autofailAfter"]) { // If the previous draw would make this an autofail, do that
            addToResultsTracker(resultsTracker, total, probMod, autofail_value, true)
        } else if (token["redraw"] && modifiers[token["name"]]["param"] != 'noRedraw') { // If this is a token that prompts a redraw, do that
            var total = calculateTotal(previousTotal, token, modifiers)
            if (drawCount + 1 > redrawMax) { // If this draw is too many redraws - treat as an autofail to speed up calculation
                handleTooManyRedraws(total, remainingOptions, redrawHandling, autofail_value, resultsTracker, probMod)
            } else {
                calculationStep(
                    remainingOptions.slice(0, i).concat(remainingOptions.slice(i + 1)), total, probMod / (remainingOptions.length - 1), token["name"], drawCount + 1, autofail_value, redrawMax, resultsTracker, modifiers, redrawHandling)
            }
        } else { // No redraw - just spit out the current total and probability
            addToResultsTracker(resultsTracker, total, probMod, autofail_value, false)
        }
    });
}

/* Get the cumulative probability of success with X+ given each specific value's probability */
function cumulativeProb(prob) {
    var probCumul = new Object();
    probCumul[-2] = sumStuffUp(prob, 1);
    probCumul[-1] = sumStuffUp(prob, 0);
    probCumul[0] = sumStuffUp(prob, -1);
    probCumul[1] = sumStuffUp(prob, -2);
    probCumul[2] = sumStuffUp(prob, -3);
    probCumul[3] = sumStuffUp(prob, -4);
    probCumul[4] = sumStuffUp(prob, -5);
    probCumul[5] = sumStuffUp(prob, -6);
    probCumul[6] = sumStuffUp(prob, -7);
    probCumul[7] = sumStuffUp(prob, -8);
    probCumul[8] = sumStuffUp(prob, -9);

    return probCumul;
}

/* Sum for above X skill value, for cumulative probability */
function sumStuffUp(prob, target) {
    var temp = 0;
    for (const [k, v] of Object.entries(prob)) {
        if (k > target) {
            temp += v;
        }
    }
    return temp;
}

/* Sum for X skill value and below, for probability of failure */
function sumStuffDown(prob, target) {
    var temp = 0;
    for (const [k, v] of Object.entries(prob)) {
        if (k <= target) {
            temp += v;
        }
    }
    return temp;
}

/* Do all the steps of calculating success chance for all relevant skill values */
function run(tokens, abilitiesActive, abilityEffects, modifiers, redrawMax, redrawHandling) {
    var resultsTracker = {};
    for (let i = -8; i < 3; i++) {
        resultsTracker[i] = 0;
    }
    var bag = makeBag(tokens);
    prepareModifiers(abilitiesActive, abilityEffects, modifiers);
    calculationStep(bag, 0, 1 / bag.length, null, 1, tokens['autofail']["value"], redrawMax, resultsTracker, modifiers, redrawHandling);
    var cumulative = cumulativeProb(resultsTracker);
    saveData(saveName, data);
    return cumulative
}

/* Set up to calculate the chance of redrawing 1 to N times  given the current bag,
then call redrawProb to actually calculate those odds */
function chanceOfNRedraws(tokens, maxN) {
    var redrawTokensCount = 0;
    var allTokensCount = 0;
    for (const [k, v] of Object.entries(tokens)) {
        allTokensCount += v["count"];
        if (v["redraw"]) {
            redrawTokensCount += v["count"];
        }
    }
    var redrawProbs = [];
    redrawProb(redrawProbs, 1, allTokensCount, redrawTokensCount, 1, maxN);

    return redrawProbs
}

/* Actually calculate the chance of redrawing 1 to N times */
function redrawProb(allProbs, prob, allCount, redrawCount, currentN, maxN) {
    var newProb = prob * redrawCount / allCount
    allProbs.push(Math.round(newProb * 100))
    if ((currentN + 1) <= maxN) {
        redrawProb(allProbs, newProb, allCount - 1, redrawCount - 1, currentN + 1, maxN)
    }
}

/* Plot chance of 1 to N redraws given the current bag */
function redrawsPlot(tokens, maxN) {
    xValue = range(1, maxN);
    yValue = chanceOfNRedraws(tokens, maxN);

    var textValueRaw = yValue.map(String)
    var textValue = []
    textValueRaw.forEach(function (val, i) {
        textValue.push(val + "%")
    })
    var data = [{
        x: xValue,
        y: yValue,
        type: 'bar',
        text: textValue,
        textposition: 'auto',
        textfont: {
            size: 18
        }
    }];
    var layout = {
        xaxis: {
            title: {
                text: 'Nth redraw',
                font: {
                    size: 18
                }
            },
            tickfont: {
                size: 16
            },
            tickmode: "linear",
            tick0: 1,
            dtick: 1
        },
        yaxis: {
            title: {
                text: 'Probability of having<br>that many redraws (%)',
                font: {
                    size: 18
                }
            },
            tickfont: {
                size: 16
            },
            range: [0, 101]
        }
    }

    return Plotly.newPlot('redrawsPlot', data, layout);

}

/* Plot of success chance at each skill minus difficulty value */
function probabilityPlot(p) {
    var xValue = range(-2, 8);
    var yValue = [
        Math.round(p[-2]),
        Math.round(p[-1]),
        Math.round(p[0]),
        Math.round(p[1]),
        Math.round(p[2]),
        Math.round(p[3]),
        Math.round(p[4]),
        Math.round(p[5]),
        Math.round(p[6]),
        Math.round(p[7]),
        Math.round(p[8])
    ];

    var textValueRaw = yValue.map(String)
    var textValue = []
    textValueRaw.forEach(function (val, i) {
        textValue.push(val + "%")
    })
    var data = [{
        x: xValue,
        y: yValue,
        type: 'bar',
        text: textValue,
        textposition: 'auto',
        textfont: {
            size: 18
        }
    }];
    var layout = {
        xaxis: {
            title: {
                text: 'Skill value minus test difficulty',
                font: {
                    size: 18
                }
            },
            tickfont: {
                size: 16
            }
        },
        yaxis: {
            title: {
                text: 'Probability of success (%)',
                font: {
                    size: 18
                }
            },
            tickfont: {
                size: 16
            },
            range: [0, 101]
        }
    }

    return Plotly.newPlot('probPlot', data, layout);
}


//  ---------------- Set up the page and params ------------------

/* Setting up starting / general data and params */
var saveName = "mgArkhamChaosBagData"
var data = {
    // [count, value, redraw, autofail-if-after, is-autofail]
    tokenNames: ['+1', '0', '-1', '-2', '-3', '-4', '-5', '-6', '-7', '-8', 'skull', 'cultist', 'tablet', 'elderThing', 'star', 'autofail', 'bless', 'curse', 'frost'],
    tokens: {
        '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "+1", "order": 0 },
        '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "0", "order": 1 },
        '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "-1", "order": 2 },
        '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "-2", "order": 3 },
        '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "-3", "order": 4 },
        '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "-4", "order": 5 },
        '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "-5", "order": 6 },
        '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "-6", "order": 7 },
        '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "-7", "order": 8 },
        '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "-8", "order": 9 },
        'skull': { 'count': 0, 'value': 0, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "Skull", "order": 10 },
        'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "Cultist", "order": 11 },
        'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "Tablet", "order": 12 },
        'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "Elder Thing", "order": 13 },
        'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofailAfter': null, 'autofail': false, "fullName": "Star", "order": 14 },
        'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofailAfter': null, 'autofail': true, "fullName": "Autofail", "order": 15 },
        'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofailAfter': null, 'autofail': false, "fullName": "Bless", "order": 16 },
        'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofailAfter': null, 'autofail': false, "fullName": "Curse", "order": 17 },
        'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofailAfter': 'frost', 'autofail': false, "fullName": "Frost", "order": 18 }
    },
    modifiers: {
        '+1': {},
        '0': {},
        '-1': {},
        '-2': {},
        '-3': {},
        '-4': {},
        '-5': {},
        '-6': {},
        '-7': {},
        '-8': {},
        'skull': {},
        'cultist': {},
        'tablet': {},
        'elderThing': {},
        'star': {},
        'autofail': {},
        'bless': {},
        'curse': {},
        'frost': {}
    },
    modalTokenIssueOpen: false,
    modalIssueList: [],
    modalRedrawAlertOpen: false,
    modalRedrawMaxOpen: false,
    redrawMax: 4,
    redrawHandling: "autofail",
    redrawOptions: [
        { text: "Treat as autofail", value: "autofail", param: -999 },
        { text: "Apply median value of (remaining, non-redraw, non-autofail) tokens, rounded down", value: "median" },
        { text: "Apply average value of (remaining, non-redraw, non-autofail) tokens, rounded down", value: "average" },
        { text: "Apply token value: +1", value: "t1" },
        { text: "Apply token value: 0", value: "t0" },
        { text: "Apply token value: -1", value: "t-1" },
        { text: "Apply token value: -2", value: "t-2" },
        { text: "Apply token value: -3", value: "t-3" },
        { text: "Apply token value: -4", value: "t-4" },
        { text: "Apply token value: -5", value: "t-5" },
        { text: "Apply token value: -6", value: "t-6" },
        { text: "Apply token value: -7", value: "t-7" },
        { text: "Apply token value: -8", value: "t-8" },
    ],
    redrawRange: [],
    redrawProbs: [],
    whichBlock: "tokens", // "tokens", "settings", or "abilities"
    tokenOptions: [
        { text: "", value: null },
        { text: "Bless", value: "bless" },
        { text: "Curse", value: "curse" },
        { text: "Cultist", value: "cultist" },
        { text: "Elder Thing", value: "elderThing" },
        { text: "Frost", value: "frost" },
        { text: "Skull", value: "skull" },
        { text: "Tablet", value: "tablet" }

    ],
    abilitiesActive: [],
    abilityOptions: [
        { text: 'Defiance (Skull)', value: 'DefianceSkull' },
        { text: 'Defiance (Cultist)', value: 'DefianceCultist' },
        { text: 'Defiance (Tablet)', value: 'DefianceTablet' },
        { text: 'Defiance (Elder Thing)', value: 'DefianceElderThing' },
        { text: 'Defiance (2)', value: 'Defiance2XP' },
        { text: 'Jim Culver', value: 'JimCulver' },
        { text: 'Ritual Candles', value: 'RitualCandles1' },
        { text: 'Ritual Candles', value: 'RitualCandles2' }
    ],
    abilityEffects: {
        "DefianceSkull": {
            "skull": { "type": "s", "value": 0, "param": "noRedraw" }
        },
        "DefianceCultist": {
            "cultist": { "type": "s", "value": 0, "param": "noRedraw" }
        },
        "DefianceTablet": {
            "tablet": { "type": "s", "value": 0, "param": "noRedraw" }
        },
        "DefianceElderThing": {
            "elderThing": { "type": "s", "value": 0, "param": "noRedraw" }
        },
        "Defiance2XP": {
            "skull": { "type": "s", "value": 0, "param": "noRedraw" },
            "cultist": { "type": "s", "value": 0, "param": "noRedraw" },
            "tablet": { "type": "s", "value": 0, "param": "noRedraw" },
            "elderThing": { "type": "s", "value": 0, "param": "noRedraw" }
        },
        "JimCulver": {
            "skull": { "type": "s", "value": 0, "param": null }
        },
        "RitualCandles1": {
            "skull": { "type": "a", "value": 1, "param": null },
            "cultist": { "type": "a", "value": 1, "param": null },
            "tablet": { "type": "a", "value": 1, "param": null },
            "elderThing": { "type": "a", "value": 1, "param": null }
        },
        "RitualCandles2": {
            "skull": { "type": "a", "value": 1, "param": null },
            "cultist": { "type": "a", "value": 1, "param": null },
            "tablet": { "type": "a", "value": 1, "param": null },
            "elderThing": { "type": "a", "value": 1, "param": null }
        }
    },
    campaignOptions: [
        { text: "Custom", value: "custom" },
        { text: "Night of the Zealot (Easy)", value: "notz_e" },
        { text: "Night of the Zealot (Standard)", value: "notz_s" },
        { text: "Night of the Zealot (Hard)", value: "notz_h" },
        { text: "Night of the Zealot (Expert)", value: "notz_x" },
        { text: "The Dunwich Legacy (Easy)", value: "dl_e" },
        { text: "The Dunwich Legacy (Standard)", value: "dl_s" },
        { text: "The Dunwich Legacy (Hard)", value: "dl_h" },
        { text: "The Dunwich Legacy (Expert)", value: "dl_x" },
        { text: "The Path to Carcosa (Easy)", value: "ptc_e" },
        { text: "The Path to Carcosa (Standard)", value: "ptc_s" },
        { text: "The Path to Carcosa (Hard)", value: "ptc_h" },
        { text: "The Path to Carcosa (Expert)", value: "ptc_x" },
        { text: "The Forgotten Age (Easy)", value: "fa_e" },
        { text: "The Forgotten Age (Standard)", value: "fa_s" },
        { text: "The Forgotten Age (Hard)", value: "fa_h" },
        { text: "The Forgotten Age (Expert)", value: "fa_x" },
        { text: "The Circle Undone (Easy)", value: "cu_e" },
        { text: "The Circle Undone (Standard)", value: "cu_s" },
        { text: "The Circle Undone (Hard)", value: "cu_h" },
        { text: "The Circle Undone (Expert)", value: "cu_x" },
        { text: "The Dream-Eaters (A) (Easy)", value: "dea_e" },
        { text: "The Dream-Eaters (A) (Standard)", value: "dea_s" },
        { text: "The Dream-Eaters (A) (Hard)", value: "dea_h" },
        { text: "The Dream-Eaters (A) (Expert)", value: "dea_x" },
        { text: "The Dream-Eaters (B) (Easy)", value: "deb_e" },
        { text: "The Dream-Eaters (B) (Standard)", value: "deb_s" },
        { text: "The Dream-Eaters (B) (Hard)", value: "deb_h" },
        { text: "The Dream-Eaters (B) (Expert)", value: "deb_x" },
        { text: "The Innsmouth Conspiracy (Easy)", value: "ic_e" },
        { text: "The Innsmouth Conspiracy (Standard)", value: "ic_s" },
        { text: "The Innsmouth Conspiracy (Hard)", value: "ic_h" },
        { text: "The Innsmouth Conspiracy (Expert)", value: "ic_x" },
        { text: "Edge of the Earth (Easy)", value: "eote_e" },
        { text: "Edge of the Earth (Standard)", value: "eote_s" },
        { text: "Edge of the Earth (Hard)", value: "eote_h" },
        { text: "Edge of the Earth (Expert)", value: "eote_x" },
        { text: "The Scarlet Keys (Easy)", value: "tsk_e"},
        { text: "The Scarlet Keys (Standard)", value: "tsk_s"},
        { text: "The Scarlet Keys (Hard)", value: "tsk_h"},
        { text: "The Scarlet Keys (Expert)", value: "tsk_x"},
        
    ],
    campaignTokenSets: {
        'notz_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'notz_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'notz_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'notz_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'dl_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'dl_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'dl_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'dl_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'ptc_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'ptc_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'ptc_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'ptc_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 1, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'fa_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'fa_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 1, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'fa_h': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 1, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'fa_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 1, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'cu_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'cu_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'cu_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'cu_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'dea_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'dea_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'dea_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'dea_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'deb_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'deb_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'deb_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'deb_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'ic_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'ic_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'ic_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'ic_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'eote_e': {
            '+1': { 'count': 3, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'eote_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 1, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'eote_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 2, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'eote_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 1, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 1, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 3, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'tsk_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'tsk_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'tsk_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        },
        'tsk_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '+1', 'order': 0 },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '0', 'order': 1 },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-1', 'order': 2 },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-2', 'order': 3 },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-3', 'order': 4 },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-4', 'order': 5 },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-5', 'order': 6 },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-6', 'order': 7 },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-7', 'order': 8 },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': '-8', 'order': 9 },
            'skull': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Skull', 'order': 10 },
            'cultist': { 'count': 0, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Cultist', 'order': 11 },
            'tablet': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Tablet', 'order': 12 },
            'elderThing': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Elder Thing', 'order': 13 },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false, 'fullName': 'Star', 'order': 17 },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true, 'fullName': 'Autofail', 'order': 18 },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Bless', 'order': 14 },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false, 'fullName': 'Curse', 'order': 15 },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false, 'fullName': 'Frost', 'order': 16 }
        }
    }
}

// Load data if its structure matches that of the current default
let tryData = loadData(saveName)
if (tryData != null && checkStoredData(tryData, data)) {
    data = tryData
}

// Check max possible redraws given the current bag
var redrawCount = 0
for (const [k, v] of Object.entries(data.tokens)) {
    if (v["redraw"]) {
        redrawCount += v["count"];
    }
}

/* Reset redrawMax to a lower value if it, and the max number of possible redraws,
are high enough that they might make the initial page load slow */
if (redrawCount > 20 && data.redrawMax > 5) {
    data.redrawMax = 4;
    data.modalRedrawAlertOpen = true;
}

// Generate the probability plot given the initial bag composition
probabilityPlot(run(data.tokens, data.abilitiesActive, data.abilityEffects, data.modifiers, data.redrawMax, data.redrawHandling))

// Set up the Vue.js stuff
var app = new Vue({
    el: '#app',
    data: data,
    methods: {
        calculateProbabilities() {
            var runValid = true;
            var runIssue = null;
            this.modalIssueList = []
            for (const [k, v] of Object.entries(this.tokens)) {
                if (v["count"] > 0 && (v["value"] === null || v["value"] === "")) {
                    runValid = false;
                    runIssue = "token";
                    this.modalIssueList.push(v["fullName"])
                } else if (v["count"] === null || v["count"] === "") {
                    runValid = false;
                    runIssue = "token";
                    this.modalIssueList.push(v["fullName"])
                }
            }
            if (this.redrawMax === null || this.redrawMax === "") {
                runValid = false;
                this.modalRedrawMaxOpen = true;
            }
            if (!(runValid) && runIssue == "token") {
                this.modalTokenIssueOpen = true;
            }
            if (runValid) {
                probabilityPlot(run(this.tokens, this.abilitiesActive, this.abilityEffects, this.modifiers, this.redrawMax, this.redrawHandling));
                document.body.scrollTop = 0;
                document.documentElement.scrollTop = 0;
            }
        },
        setCampaignTokens: function (event) {
            if (event.target.value != "custom") {
                this.tokens = data.campaignTokenSets[event.target.value]
            }
        },
        changeTabs: function (tab) {
            this.whichBlock = tab;
        },
        updateRedrawsPlot: function () {
            redrawsPlot(this.tokens, 10)
        },
        closeModalTokenIssue: function () {
            this.modalTokenIssueOpen = false;
        },
        closeModalRedrawAlert: function () {
            this.modalRedrawAlertOpen = false;
        },
        closeModalRedrawMax: function () {
            this.modalRedrawMaxOpen = false;
        }
    },
    computed: {
        orderedTokens: function () {
            var tokenArray = []
            for (const [k, v] of Object.entries(this.tokens)) {
                tokenArray.push({ "k": k, "order": v["order"] })
            }
            var tokenArraySorted = _.orderBy(tokenArray, ["order"])
            return tokenArraySorted
        }
    }
})