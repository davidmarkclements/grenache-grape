
'use strict'
const tapenet = require('tapenet')
const spinup = require('./helpers/spinup')
const {
  NODES = 251,
  RTS = 1000
} = process.env

const topology = tapenet.topologies.basic(NODES)
const { h1: bootstrapper, ...rest } = topology
const nodes = spinup.arrarify(rest)
const putters = nodes.slice(0, Math.ceil(nodes.length / 2))
const getters = nodes.slice(
  putters.length,
  putters.length + Math.floor(nodes.length / 2)
)

tapenet(`1 mutable put peer, ${NODES - 2} mutable get peers, ${RTS} gets per peer`, (t) => {
  const state = {
    rts: +RTS,
    putterCount: putters.length,
    $shared: {
      kv: {}
    }
  }
  const scenario = [
    {
      containers: putters,
      ready (t, peer, state, next) {
        const crypto = require('crypto')
        const ed = require('ed25519-supercop')
        const keypair = ed.createKeyPair(ed.createSeed())
        const { publicKey: key } = keypair
        const value = crypto.randomBytes(32).toString('hex')
        const { $shared, $index } = state
        const sign = (buf) => {
          return ed.sign(
            buf, keypair.publicKey, keypair.secretKey
          )
        }
        $shared.kv[$index] = { key, value }
        peer.put({ k: key, v: value, sign, seq: 0 }, (err, hash) => {
          $shared.kv[$index].hash = hash
          console.log($shared.kv[$index])
          t.error(err, 'no announce error')
          next(null, { ...state, key, value, sign })
        })
        
      },
    },
    {
      containers: getters,
      options: { ephemeral: false },
      run (t, peer, { rts, $shared, $index }, done) {
        const { hash, value } = $shared.kv[$index]
        const started = Date.now()
        gets(rts)
        function gets (n) {
          if (n === 0) {
            t.pass(`${rts} round trips took ${Date.now() - started} ms`)
            done()
            return
          }
          peer.get({ hash }, (err, { v } = {}) => {
            try {
              t.error(err, 'no get error')
              if (err) return
              t.is(v, value)
            } finally {
              gets(n - 1)
            }
          })
        }
      }
    }
  ]
  spinup(NODES, { t, scenario, state, bs: [bootstrapper] })
})
