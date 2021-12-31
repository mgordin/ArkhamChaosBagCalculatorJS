// Params
var data = {
    tokens: {
        '+1': [1, 1, false, null],
        '0': [2, 0, false, null],
        '-1': [3, -1, false, null],
        '-2': [2, -2, false, null],
        '-3': [1, -3, false, null],
        '-4': [1, -4, false, null],
        '-5': [0, -5, false, null],
        'skull': [2, -2, false, null],
        'cultist': [2, -2, false, null],
        'tablet': [1, -3, false, null],
        'squiggle': [2, -4, false, null],
        'star': [1, 1, false, null],
        'autofail': [1, -999, false, null],
        'bless': [0, 2, true, null],
        'curse': [0, -2, true, null],
        'frost': [4, -1, true, 'frost']
    },
    redraw_max: 4,
    variable_tokens: ['skull', 'cultist', 'tablet', 'squiggle'],
    message: 'Hello Vue.js!'
}

function makeBag(tokens) {
    var bag = []
    for (const [token_name, token] of Object.entries(tokens)) {
        for (let i = 1; i <= token[0]; i++) {
            bag.push([token[1], token[2], token_name, token[3]])
        }
    };
    return bag
}

// Functions
function range(start, end) {
    if (start === end) return [start];
    return [start, ...range(start + 1, end)];
}

function calculationStep(remainingOptions, previousTotal, probMod, pastFrost, drawCount, autofail_value, redraw_max, allResults) {
    remainingOptions.forEach(function (token, i) {
        var total = previousTotal + token[0];
        //if (probMod < 0.000001) {
        if (drawCount > redraw_max) {
            allResults.push([autofail_value, probMod])
        } else if (token[1]) {
            if (!(pastFrost && token[2] == 'Frost')) {
                calculationStep(
                    remainingOptions.slice(0, i).concat(remainingOptions.slice(i + 1)), total, probMod / (remainingOptions.length - 1), token[2] == 'Frost', drawCount + 1, autofail_value, redraw_max, allResults)
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

function run(tokens, redraw_max) {
    var allResults = []
    // Fix
    bag = makeBag(tokens)
    calculationStep(bag, 0, 1 / bag.length, false, 1, tokens['autofail'][1], redraw_max, allResults)
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
    calculationStep(options, 0, 1 / options.length, false, 1, autofail_value, allResults)
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
        textposition: 'auto',
        textfont: {
            size: 18
        }
    }];
    var layout = {
        xaxis: {
            title: {
                text: 'Skill Value vs. Test Difficulty',
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
                text: 'Probability of Success',
                font: {
                    size: 18
                }
            },
            tickfont: {
                size: 16
            }
        }
    }

    return Plotly.newPlot('probPlot', data, layout);
}

// Vue stuff

var app10 = new Vue({
    el: '#app-10',
    data: data,
    methods: {
        getProbabilitiesMessage: function () {
            probabilityPlot(run(this.tokens, this.redraw_max))
        }
    }
})