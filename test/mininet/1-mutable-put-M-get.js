
'use strict'
const tapenet = require('tapenet')
const spinup = require('./helpers/spinup')
const {
  NODES = 252,
  RTS = 1000
} = process.env

const {
  h1: putter,
  h2: bootstrapper,
  ...getters
} = tapenet.topologies.basic(NODES)

tapenet(`1 mutable put peer, ${NODES - 2} mutable get peers, ${RTS} gets per peer`, (t) => {
  const state = {
    rts: +RTS,
    $shared: {}
  }
  const scenario = [
    {
      containers: [putter],
      ready (t, peer, state, next) {
        const crypto = require('crypto')
        const ed = require('ed25519-supercop')
        const keypair = ed.createKeyPair(ed.createSeed())
        const { publicKey: key } = keypair
        const value = crypto.randomBytes(32).toString('hex')
        const sign = (buf) => {
          return ed.sign(
            buf, keypair.publicKey, keypair.secretKey
          )
        }
        next(null, { ...state, key, value, sign })
      },
      run (t, peer, { key, value, sign, $shared }, done) {
        peer.put({ k: key, v: value, sign, seq: 0 }, (err, hash) => {
          $shared.hash = hash
          try {
            t.error(err, 'no put error')
          } finally {
            done()
          }
        })
      }
    },
    {
      containers: getters,
      options: { ephemeral: false },
      run (t, peer, { rts, value, $shared }, done) {
        const started = Date.now()
        gets(rts)
        function gets (n) {
          if (n === 0) {
            t.pass(`${rts} round trips took ${Date.now() - started} ms`)
            done()
            return
          }
          peer.get({ hash: $shared.hash }, (err, result) => {
            try {
              t.error(err, 'no get error')
              if (err) return
              t.is(result.v, value)
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
