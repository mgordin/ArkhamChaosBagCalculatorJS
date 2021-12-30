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

function calculationStep(remainingOptions, previousTotal, probMod, pastFrost, first) {

}

function aggregate(results) {
    var prob = new Object();
    for (i in range(-25, 21).concat([-999])) {
        //prob[i] = sum([p for v, p in results if v == i])* 100
        const filteredResults = results.filter(function (array) {
            return array.includes(i)
        })
        const probSum = (sum, curr) => sum + curr[1];
        prob[i] = probSum;

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

// Vue stuff
