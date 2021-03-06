'use strict'
/* eslint-disable no-console */

const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const libp2p = require('../../src/libp2p.js')
const multiaddr = require('multiaddr')
const pull = require('pull-stream')
const async = require('async')
const Pushable = require('pull-pushable')
const pushPrimary = Pushable()
const pushSecondary = Pushable()
const app = require('./app.json');

async.parallel([
  (callback) => {
    PeerId.createFromJSON(require('./peer-id-listener'), (err, idPrimary) => {
      if (err) throw err
      callback(null, idPrimary)
    })
  },
  (callback) => {
    PeerId.createFromJSON(require('./peer-id-dialer'), (err, idSecondary) => {
      if (err) throw err
      callback(null, idSecondary)
    })
  },
  (callback) => {
    PeerId.create((err, idTertiary) => {
      if (err) throw err
      callback(null, idTertiary)
    })
  }
],(err, ids) => {
  if (err) throw err
  const peerPrimary = new PeerInfo(ids[0])
  peerPrimary.multiaddr.add(multiaddr('/ip4/0.0.0.0/tcp/' + app.primary.port))
  const nodePrimary = new libp2p.Node(peerPrimary)

  const peerSecondary = new PeerInfo(ids[1])
  peerSecondary.multiaddr.add(multiaddr('/ip4/0.0.0.0/tcp/' + app.secondary.port))
  const nodeSecondary = new libp2p.Node(peerSecondary)

  const peerTertiary = new PeerInfo(ids[2])
  peerTertiary.multiaddr.add(multiaddr('/ip4/0.0.0.0/tcp/' + app.tertiary.port))
  const nodeTertiary = new libp2p.Node(peerTertiary)
  setStuffUp(peerPrimary, peerSecondary, nodeTertiary)
})

function setStuffUp(peerPrimary, peerSecondary, nodeTertiary) {

  nodeTertiary.start((err) => {
    if (err) throw err
    console.log('Tertiary node ready')
    nodeTertiary.swarm.on('peer-mux-established', (peerInfo) => {
      console.log('Incoming connection from ' + peerInfo.id.toB58String())
    })
    nodeTertiary.dialByPeerInfo(peerPrimary, app.primary.protocol, (err, conn) => {
      if (err) throw err
      console.log('Tertiary node dialed to primary node')
      pull(pushPrimary, conn)
      pull(conn, pull.map((data) => {return data.toString('utf8').replace('\n','')}), pull.drain(console.log))
    })/* dialer ends here */

    nodeTertiary.dialByPeerInfo(peerSecondary, app.secondary.protocol, (err, conn) => {
      if (err) throw err
      console.log('Tertiary node dialed to secondary node')
      pull(pushSecondary, conn)
      pull(conn, pull.map((data) => {return data.toString('utf8').replace('\n','')}), pull.drain(console.log))
    })/* dialer ends here */
  })
}

process.stdin.setEncoding('utf8')
process.openStdin().on('data', (chunk) => {
  try {
    var data = chunk.toString()
    var val = JSON.parse(chunk.toString())
    if (val.receiver === 'primary') {
      pushPrimary.push(data)
    }else if (val.receiver === 'secondary') {
      pushSecondary.push(data)
    }else {
      console.log('invalid receiver option. Must be \'primary\' or \'secondary\'');
    }
  } catch (e) {
    console.log('failed '+e);
  }
})
