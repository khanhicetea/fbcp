const fs = require('fs')
const YAML = require('yaml')
const Queue = require('buffered-queue')
const express = require('express')
const app = express()
const cookieParser = require('cookie-parser')
const fetch = require('node-fetch')


const file = fs.readFileSync('./settings.yml', 'utf8')
const settings = YAML.parse(file)
const logging = settings.logging || false
const pixels = settings.pixels || {}
const graphBaseUrl = settings.graphBaseUrl || "https://graph.facebook.com/v10.0"

if (logging && !fs.existsSync('logs')) {
  fs.mkdirSync('logs')
}

for (pixelID in pixels) {
  pixels[pixelID].queue = new Queue(pixelID.toString(), {
    size: settings.buffer_size || 1,
    flushTimeout: settings.buffer_interval || null,
  })
  pixels[pixelID].queue.on('flush', function(data, pixelID) {
    const url = graphBaseUrl + "/" + pixelID + "/events?access_token=" + pixels[pixelID].token
    const postBody = {
      "data": data,
    }
    if ("test_code" in pixels[pixelID]) {
      postBody["test_event_code"] = pixels[pixelID].test_code
    }
    fetch(url, {
      method: 'post',
      timeout: settings.timeout || 10000,
      body:    JSON.stringify(postBody),
      headers: { 'Content-Type': 'application/json' },
    })
    .then(res => res.json())
    .then(json => console.log(json))
    .catch(err => console.error(err))

    if (logging) {
      const logLine = data.map((row) => JSON.stringify(row)).join("\n") + "\n"
      fs.appendFile('logs/'+pixelID+'.jsonl', logLine, () => {})
    }
  })
}
const currentTs = () => {
  return Math.floor(Date.now() / 1000)
}
const fullUrl = (req) => {
  return req.protocol + '://' + req.get('Host') + req.url
}
const prepareData = (req, eventName, eventData, eventID) => {
  const eventSourceUrl = new URL(req.get('Referrer') || fullUrl(req))
  eventSourceUrl.searchParams.delete('phone')
  eventSourceUrl.searchParams.delete('email')

  const pixelData = {
    "event_name": eventName,
    "event_time": currentTs(),
    "event_source_url": eventSourceUrl.toString(),
    "action_source": "website",
    "user_data": {
      "client_user_agent": req.get('User-Agent'),
      "client_ip_address": req.ip,
    },
    "custom_data": eventData,
    "opt_out": false,
  }
  if (eventID) {
    pixelData["event_id"] = eventID
  }
  if (eventName === "Purchase" && "phone" in eventData) {
    pixelData["user_data"]["ph"] = eventData["phone"]
  }
  if ('_fbc' in req.cookies) {
    pixelData["user_data"]["fbc"] = req.cookies._fbc
  }
  if ('_fbp' in req.cookies) {
    pixelData["user_data"]["fbp"] = req.cookies._fbp
  }
  return pixelData
}

console.log(settings)

app.enable('trust proxy')
app.disable('x-powered-by')
app.use(cookieParser())

const route_pixel_hanlder = function (req, res) {
  res.send('ok:'+Date.now().toString())
  
  const pixelID = req.params.pixelID
  if (pixelID in pixels) {
    let customData = {}
    try {
      customData = JSON.parse(req.query.customData || '{}')
    } catch (e) {
      console.error(e)
    }
    
    const eventID = req.query.eventID || null
    const pixelData = prepareData(req, req.params.eventName, customData, eventID)
    pixels[pixelID].queue.add(pixelData)
  }
}

app.get('/pixel/:pixelID/:eventName', route_pixel_hanlder)
app.post('/pixel/:pixelID/:eventName', route_pixel_hanlder)

const listenPort = process.env.PORT || 3000
const listenBind = process.env.BIND_IP || '127.0.0.1'
app.listen(listenPort, listenBind, () => {
    console.log('Running')
})
