import "reflect-metadata"
import * as schulze from 'schulze-method'

const VOTER_COUNT = 10000
const CANDIDATES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm']

class PRNG {
    private seed: number
    constructor(seed: number) {
        this.seed = seed % 2147483647;
        if (this.seed <= 0) this.seed += 2147483646;
    }
    public next() {
        return this.seed = this.seed * 16807 % 2147483647;
    }
}

const rnd = new PRNG(100)

function nextRandomCandidate() {
    return rnd.next() % CANDIDATES.length
}


const ballots = []        
for (let i = 0; i < VOTER_COUNT; i++) {
    const ranks = []
    for (let c = 0; c < CANDIDATES.length; c++) {
        ranks.push(nextRandomCandidate())
    }
    ballots.push(ranks)
}

const validationErrors = [...schulze.validate(CANDIDATES, ballots)]
if (validationErrors.length > 0) {
    console.log('Validation errors:')
    console.log(validationErrors)
    process.exit(111)    
}


// console.log(ballots)
console.log('Winning ordering')
console.log(schulze.run(CANDIDATES.length, ballots))

