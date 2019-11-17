/* global ip */
'use strict'
const tapenet = require('tapenet')
const spinup = require('./helpers/spinup')

const {
  NODES = 252,
  RTS = 1000
} = process.env

const topology = tapenet.topologies.basic(NODES)
const { h1: lookup, h2: bootstrapper, ...announcers } = topology

tapenet(`1 lookup peer, ${NODES - 2} announcing peers, ${NODES - 2} topics, ${RTS} lookups per topic`, (t) => {
  const state = {
    rts: +RTS,
    $shared: {
      cfg: {},
      topics: {}
    }
  }
  const scenario = [
    {
      containers: announcers,
      options: { ephemeral: false },
      ready (t, peer, state, next) {
        const crypto = require('crypto')
        const topic = crypto.randomBytes(32).toString('hex')
        const { $shared, $index } = state
        const port = peer.conf.dht_port
        $shared.cfg[$index] = { host: ip, port }
        $shared.topics[$index] = topic
        next(null, { ...state, topic, port })
      },
      run (t, peer, { topic, port }, done) {
        peer.announce(topic, port, (err) => {
          try {
            t.error(err, 'no announce error')
          } finally {
            done()
          }
        })
      }
    },
    {
      containers: [lookup],
      options: { ephemeral: false },
      run (t, peer, { rts, $shared, bootstrap }, done) {
        const { cfg } = $shared
        const topics = Object.values($shared.topics)
        const started = Date.now()
        lookups(rts, 0)
        function lookups (n, i) {
          const topic = topics[i]
          if (n === 0) {
            t.pass(`${rts} round trips took ${Date.now() - started} ms`)
            if (i < topics.length - 1) {
              lookups(0, i + 1)
              return
            }
            done()
            return
          }
          peer.lookup(topic, (err, peers) => {
            try {
              t.error(err, 'no lookup error')
              if (err) return
              const hasResult = peers.length > 0
              t.is(hasResult, true, 'lookup has a result')
              if (hasResult === false) return
              const port = peer.conf.dht_port
              const expected = new Set([
                ...bootstrap,
                // the lookup node is non-ephemeral, so
                // it may also respond to its own lookup:
                `${ip}:${port}`,
                ...Object.values(cfg).map(({ host, port }) => {
                  return `${host}:${port}`
                })
              ])

              const peersMatch = peers.every((peer) => {
                return expected.has(peer)
              })
              t.ok(peersMatch, 'peers match')
            } finally {
              lookups(n - 1, i)
            }
          })
        }
      }
    }
  ]
  spinup(NODES, { t, scenario, state, bs: [bootstrapper] })
})
