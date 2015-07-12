/**
 * @param pairs
 * @param opt_sortFn
 * @returns {Array.<T>}
 */
function dependencySort(pairs, opt_sortFn) {
    var numHeads = {};
    var tails = {};
    var i, tail, head;
    for (i = 0; i < pairs.length; i++) {
        var el = pairs[i];
        head = el[0];
        tail = el[1];
        numHeads[tail] = (numHeads[tail] || 0) + 1;
        (tails[head] || (tails[head] = [])).push(tail);
    }
    var ordered = [];
    for (head in tails) {
        if (tails.hasOwnProperty(head)) {
            if (!numHeads[head]) {
                ordered.push(head);
            }
        }
    }
    ordered.sort(opt_sortFn); // deterministic ordering for no-dependency items
    for (i = 0; i < ordered.length; i++) {
        head = ordered[i];
        var tailsList = tails[head];
        if (tailsList) {
            for (var j = 0; j < tailsList.length; j++) {
                tail = tailsList[j];
                numHeads[tail] -= 1;
                if (!numHeads[tail]) {
                    ordered.push(tail);
                }
            }
        }
    }
    var cyclic = [];
    for (tail in numHeads) {
        if (numHeads.hasOwnProperty(tail) && numHeads[tail] > 0) {
            cyclic.push(tail);
        }
    }
    cyclic.sort(opt_sortFn);
    return ordered.concat(cyclic).reverse();
}

module.exports = dependencySort;