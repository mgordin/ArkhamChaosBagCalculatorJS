// Params
var autofail_value = -999;
var skull_value = 0;
var cultist_value = 0;
var tablet_value = 0;
var squiggle_value = 0;
var variable_tokens = ['Skull', 'Cultist', 'Tablet', 'Squiggle']

// Functions
function range(start, end) {
    if (start === end) return [start];
    return [start, ...range(start + 1, end)];
}

function calculationStep(remainingOptions, previousTotal, probMod, pastFrost, allResults) {
    remainingOptions.forEach(function (token, i) {
        var total = previousTotal + token[0];
        if (probMod < 0.000001) {
            allResults.push([autofail_value, probMod])
        } else if (token[1]) {
            if (!(pastFrost && token[2] == 'Frost')) {
                calculationStep(
                    remainingOptions.slice(0, i).concat(remainingOptions.slice(i + 1)), total, probMod / (remainingOptions.length - 1), token[2] == 'Frost', allResults)
            } else {
                allResults.push([autofail_value, probMod])
            }
        } else if (token[0] == autofail_value) {
            allResults.push([autofail_value, probMod])
        } else {
            allResults.push([total, probMod])
        }
    });
}

function aggregate(results) {
    var prob = new Object();
    for (i in range(-25, 21).concat([-999])) {
        //prob[i] = sum([p for v, p in results if v == i])* 100
        const filteredResults = results.filter(function (array) {
            return array.includes(i)
        })
        console.log(filteredResults)
        const probSumFunction = (sum, curr) => sum + curr[1];
        prob[i] = filteredResults.reduce(probSumFunction);

        var probCumul = new Object();
        probCumul[-2] = sumStuffUp(prob, 1);
        probCumul[-1] = sumStuffUp(prob, 0);
        probCumul[0] = sumStuffUp(prob, -1);
        probCumul[1] = sumStuffUp(prob, -2);
        probCumul[2] = sumStuffUp(prob, -3);
        probCumul[3] = sumStuffUp(prob, -4);
        probCumul[4] = sumStuffUp(prob, -5);
        probCumul[5] = sumStuffUp(prob, -6);
        probCumul[6] = sumStuffDown(prob, -6);
    }

    return probCumul
}

function sumStuffUp(prob, target) {
    var temp = 0;
    for (const [k, v] of Object.entries(prob)) {
        if (k > target) {
            temp += v;
        }
    }
    return temp;
}

function sumStuffDown(prob, target) {
    var temp = 0;
    for (const [k, v] of Object.entries(prob)) {
        if (k <= target) {
            temp += v;
        }
    }
    return temp;
}

// Test it out

var options = [[1, false, 'Star']].concat(
    [[1, false, '+1']],
    [[0, false, '0'], [0, false, '0']],
    [[-1, false, '-1'], [-1, false, '-1'], [-1, false, '-1']],
    [[-2, false, '-2'], [-2, false, '-2']],
    [[cultist_value, false, 'Cultist'], [cultist_value, false, 'Cultist']],
    [[-3, false, '-3']],
    [[tablet_value, false, 'Tablet']],
    [[-4, false, '-4']],
    [[skull_value, false, 'Skull']],
    [[squiggle_value, false, 'Squiggle']],
    [[-1, true, 'Frost'], [-1, true, 'Frost'], [-1, true, 'Frost']],
    [[autofail_value, false, 'Autofail']]
);

var allResults = []
calculationStep(options, 0, 1 / options.length, false, allResults)
cumulative = aggregate(allResults)

// Vue stuff
