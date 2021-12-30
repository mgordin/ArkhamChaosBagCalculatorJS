// Params

var skull_value = -2;
var cultist_value = -2;
var tablet_value = -3;
var squiggle_value = -4;
var autofail_value = -999;
var variable_tokens = ['Skull', 'Cultist', 'Tablet', 'Squiggle']

var data = {
    cultist_value: -2,
    skull_value: -2,
    tablet_value: -3,
    squiggle_value: -4,
    autofail_value: -999,
    message: 'Hello Vue.js!'
}

// Functions
function range(start, end) {
    if (start === end) return [start];
    return [start, ...range(start + 1, end)];
}

function calculationStep(remainingOptions, previousTotal, probMod, pastFrost, drawCount, allResults) {
    remainingOptions.forEach(function (token, i) {
        var total = previousTotal + token[0];
        //if (probMod < 0.000001) {
        if (drawCount > 4) {
            allResults.push([autofail_value, probMod])
        } else if (token[1]) {
            if (!(pastFrost && token[2] == 'Frost')) {
                calculationStep(
                    remainingOptions.slice(0, i).concat(remainingOptions.slice(i + 1)), total, probMod / (remainingOptions.length - 1), token[2] == 'Frost', drawCount + 1, allResults)
            } else {
                allResults.push([autofail_value, probMod])
            }
        } else if (token[0] == autofail_value) {
            allResults.push([autofail_value, probMod])
        } else {
            allResults.push([total, probMod])
        }
    });

    //return allResults;
}

function aggregate(results) {
    var prob = new Object();
    r = range(-25, 21).concat([-999])
    r.forEach(function (value, i) {
        //prob[i] = sum([p for v, p in results if v == i])* 100
        const filteredResults = results.filter(function (array) {
            return array.includes(value)
        })
        if (filteredResults.length != 0) {
            //console.log(filteredResults[0], filteredResults[0][1], typeof (filteredResults[0][1]))
            const probSumFunction = (sum, curr) => sum + curr[1];
            prob[value] = filteredResults.reduce(probSumFunction, 0) * 100;
            //console.log(prob)
        }
    })

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

function run(options) {
    var allResults = []
    calculationStep(options, 0, 1 / options.length, false, 1, allResults)
    cumulative = aggregate(allResults)
    return cumulative
}

function testRun(cultist_value, tablet_value, skull_value, squiggle_value, autofail_value) {
    console.log("Cultist value is ", cultist_value)
    var options = [[1, false, 'Star']].concat(
        [[1, false, '+1']],
        [[0, false, '0'], [0, false, '0']],
        [[-1, false, '-1'], [-1, false, '-1'], [-1, false, '-1']],
        [[-2, false, '-2'], [-2, false, '-2']],
        [[cultist_value, false, 'Cultist'], [cultist_value, false, 'Cultist']],
        [[-3, false, '-3']],
        [[tablet_value, false, 'Tablet']],
        [[-4, false, '-4']],
        [[skull_value, false, 'Skull'], [skull_value, false, 'Skull']],
        [[squiggle_value, false, 'Squiggle'], [squiggle_value, false, 'Squiggle']],
        [[-1, true, 'Frost'], [-1, true, 'Frost'], [-1, true, 'Frost']],
        [[autofail_value, false, 'Autofail']]
    );

    var allResults = []
    calculationStep(options, 0, 1 / options.length, false, 1, allResults)
    cumulative = aggregate(allResults)
    return cumulative
}

function probabilityPlot(p) {
    xValue = range(-2, 5);
    yValue = [
        Math.round(p[-2]),
        Math.round(p[-1]),
        Math.round(p[0]),
        Math.round(p[1]),
        Math.round(p[2]),
        Math.round(p[3]),
        Math.round(p[4]),
        Math.round(p[5])
    ];
    var data = [{
        x: xValue,
        y: yValue,
        type: 'bar',
        text: yValue.map(String),
        textposition: 'auto'
    }];

    return Plotly.newPlot('myDiv', data);
}

// Vue stuff

var app10 = new Vue({
    el: '#app-10',
    data: data,
    methods: {
        getProbabilitiesMessage: function () {
            this.message = JSON.stringify(testRun(this.cultist_value, this.tablet_value, this.skull_value, this.squiggle_value, this.autofail_value))
            probabilityPlot(testRun(this.cultist_value, this.tablet_value, this.skull_value, this.squiggle_value, this.autofail_value))
        }
    }
})