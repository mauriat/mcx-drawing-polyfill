// This is a simple no-dependency node web server used just for development
const http = require('http')
const fs = require('fs')
const path = require('path')
const port = 3300

const server = http.createServer((req, res) => {
  const filePath = '.' + (req.url === '/' ? '/demo.html' : req.url)
  const extname = path.extname(filePath)
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
  }
  const contentType = mimeTypes[extname] || 'application/octet-stream'
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404)
      res.end('File not found')
    } else {
      res.writeHead(200, { 'Content-Type': contentType })
      res.end(content, 'utf-8')
    }
  })
})

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`)
})