const express = require('express')
const router = express.Router()
const passport = require('passport')
const crypto = require('crypto')
const async = require('async')
const nodemailer = require('nodemailer')

//requiring use model
const User = require('../models/usermodel')

//checks if the user is authenticated
function isAuthenticatedUser(req, res, next) {
    if(req.isAuthenticated()) {
        return next()
    }
    req.flash('error', 'Please login first to access this page.')
    res.redirect('/login')
}
 
//GET routes
router.get('/login', (req, res) => {
    res.render('./users/login')
})

router.get('/signup', isAuthenticatedUser, (req, res) => {
    res.render('./users/signup')
})

router.get('/logout', isAuthenticatedUser, (req, res) => {
    req.logOut()
    req.flash('success_msg', 'You have been logged out.')
    res.redirect('/login')
})

router.get('/forgot', (req, res) => {
    res.render('./users/forgot')
})

router.get('/reset/:token', (req, res) => {
    User.findOne({resetPasswordToken: req.params.token, resetPasswordExpires: {$gt: Date.now()}})
        .then(user => {
            if(!user) {
                req.flash('error', 'Password reset token is invalid or has expired.')
                res.redirect('/forgot')
            }
            res.render('./users/newpassword', {token: req.params.token})
        })
        .catch(err => {
            req.flash('error', 'ERROR: ' + err)
            res.redirect('/forgot')
        })
})

router.get('/password/change', isAuthenticatedUser, (req, res) => {
    res.render('./users/changepassword')
})

router.get('/users/all', isAuthenticatedUser, (req, res) => {
    User.find({})
        .then(users => {
            res.render('./users/allusers', {users : users})
        })
        .catch(err => {
            console.log(err)
        })
})

router.get('/edit/:id', isAuthenticatedUser, (req, res) => {
    let searchQuery = {_id : req.params.id}

    User.findOne(searchQuery)
        .then(user => {
            res.render('./users/edituser', {user : user})
        })
        .catch(err => {
            req.flash('error', 'ERROR: ' + err)
            res.redirect('/users/all')
    })
})


//POST routes
router.post('/login', passport.authenticate('local', {
    successRedirect : '/dashboard',
    failureRedirect : '/login',
    failureFlash : 'Invalid email or password. Try again!!!'
}))

router.post('/signup', isAuthenticatedUser, (req, res) => {
    let {name, email, password} = req.body

    let userData = {
        name : name,
        email : email
    }

    User.register(userData, password, (err, user) => {
        if(err) {
            req.flash('error_msg', 'ERROR: ' + err)
            res.redirect('/signup')
        }
        req.flash('success_msg', 'Account created successfully')
        res.redirect('/signup')
    })
})

router.post('/password/change', (req, res) => {
    if(req.body.password !== req.body.confirmpassword) {
        req.flash('error', "Password don't match. Try again!!!")
        return res.redirect('/password/change')
    }

    User.findOne({email: req.user.email})
        .then(user => {
            user.setPassword(req.body.password, err => {
                user.save()
                    .then(user => {
                        req.flash('success_msg', 'Password changed successfully.')
                        res.redirect('/password/change')
                    })
                    .catch(err => {
                        req.flash('error', 'ERROR: ' + err)
                        res.redirect('/password/change')
                    })
            })
        })
})


//route to handle forgot password
router.post('/forgot', (req, res, next) => {
    let recoveryPassword = ''
    async.waterfall([
        (done) => {
            crypto.randomBytes(20, (err, buf) => {
                let token = buf.toString('hex')
                done(err, token)
            })
        },
        (token, done) => {
            User.findOne({email: req.body.email})
                .then(user => {
                    if(!user) {
                        req.flash('error', 'User does not exist with this email.')
                        return res.redirect('/forgot')
                    }

                    user.resetPasswordToken = token
                    user.resetPasswordExpires = Date.now() + 1800000   //   30 minutes

                    user.save(err => {
                        done(err, token, user)
                    })
                })
                .catch(err => {
                    req.flash('error', 'ERROR: ' + err)
                    res.redirect('/forgot')
                })
        },
        (token, user) => {
            let smtpTransport = nodemailer.createTransport({
                service : 'Gmail',
                auth : {
                    user : process.env.GMAIL_EMAIL,
                    pass : process.env.GMAIL_PASSWORD
                }
            })

            let mailOptions = {
                to: user.email,
                from: 'Ndeloko Ulrich ulrichflynn9@gmail.com',
                subject: 'Recovery email from Authentication App',
                text: 'Please click the following link to recover your password: \n\n' +
                      'http://' + req.headers.host + '/reset/' + token + '\n\n' +
                      'If you did not request this, please ignore this mail.'
            }
            smtpTransport.sendMail(mailOptions, err => {
                req.flash('success_msg', 'An email has been sent to this address. Please check your email.')
                res.redirect('/forgot')
            })
        }

    ], err => {
        if(err) res.redirect('/forgot')
    })
})


router.post('/reset/:token', (req, res) => {
    async.waterfall([
        (done) => {
            User.findOne({resetPasswordToken: req.params.token, resetPasswordExpires: {$gt: Date.now()}})
            .then(user => {
                if(!user) {
                    req.flash('error', 'Password reset token is invalid or has expired.')
                    res.redirect('/forgot')
                }

                if(req.body.password !== req.body.confirmpassword) {
                    req.flash('error', "Password don't match.")
                    return res.redirect('/forgot')
                }

                user.setPassword(req.body.password, err => {
                    user.resetPasswordToken = undefined
                    user.resetPasswordExpires = undefined

                    user.save(err => {
                        req.logIn(user, err => {
                            done(err, user)
                        })
                    })
                })
            })
            .catch(err => {
                req.flash('error', 'ERROR: ' + err)
                res.redirect('/forgot')
            })
        },
        (user) => {
            let smtpTransport = nodemailer.createTransport({
                service : 'Gmail',
                auth : {
                    user : process.env.GMAIL_EMAIL,
                    pass : process.env.GMAIL_PASSWORD
                }
            })

            let mailOptions = {
                to: user.email,
                from: 'Ndeloko Ulrich ulrichflynn9@gmail.com',
                subject: 'Your password has been changed.',
                text: 'Hello, ' + user.name + '.\n\n' +
                      'This is the confirmation that the password for your account ' +user.email+ ' has been changed.'
            }

            smtpTransport.sendMail(mailOptions, err => {
                req.flash('success_msg', 'Your password has been changed successfully.')
                res.redirect('/login')
            })
        }

    ], err => {
        res.redirect('/login')
    })
})


//PUT routes starts here
router.put('/edit/:id', (req, res) => {
    let searchQuery = {_id : req.params.id}

    User.updateOne(searchQuery, {$set : {
        name : req.body.name,
        email : req.body.email
        }
    })
    .then(user => {
        req.flash('success_msg', 'User updated successfully.')
        res.redirect('/users/all')
    })
    .catch(err => {
        req.flash('error', 'ERROR: ' + err)
        res.redirect('/users/all')
    })
})


//Delete route starts here
router.delete('/delete/user/:id', (req, res) => {
    let searchQuery = {_id : req.params.id}

    User.deleteOne(searchQuery)
        .then(user => {
            req.flash('success_msg', 'User deleted successfully.')
            res.redirect('/users/all')
        })
        .catch(err => {
            req.flash('error', 'ERROR: ' + err)
            res.redirect('/users/all')
        })
})




module.exports = router