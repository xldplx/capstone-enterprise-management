// setting up the backend server first 
const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 5000

// middleware for security
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.status(200).json({
        status: 'UP',
        message: 'API is running.'
    })
})

app.listen(port, () => {
    console.log(`Server is currently running on port: ${port}`)
})
