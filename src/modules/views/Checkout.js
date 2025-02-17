import React from 'react';
import { connect } from 'react-redux';
import { Link, Route, withRouter } from 'react-router-dom';
import { ClipLoader } from 'react-spinners';
import { Helmet } from "react-helmet";
import Cookies from 'universal-cookie';

import { Typography, withStyles, Grid, Snackbar } from '@material-ui/core';
import 'typeface-roboto';

import MySnackbar from '../components/parts/MySnackbar';
import Stepper from '../components/parts/Stepper';
import CheckoutAddress from '../components/wrappers/CheckoutAddress';
import Payment from '../components/wrappers/Payment';

import { locationAPI as axios, checkoutAPI } from '../../api/api';
import { clearCart, cartStart, cartSuccess, cartFail, cartFinish } from '../../store/actions/shoppingCart';

import CartEmpty from '../components/parts/CartEmpty'
import globalVariables from '../../global-variables';
import cancelablePromise from '../../Providers/CancelablePromise';

import styles from '../../assets/jss/views/Checkout';
import './styles/checkout.css';

const cookies = new Cookies();

function getSteps() {
    return [
        globalVariables.CHECKOUT_SHIPPING_ADDRESS[globalVariables.LANG],
        globalVariables.LABEL_PAYMENT[globalVariables.LANG],
        globalVariables.LABEL_THANKS[globalVariables.LANG]
    ];
}

const ThanksView = props => {
    return (
        <Grid container item justify="center" alignItems="center" spacing={2} xs={10} style={{ textAlign: 'center', position: 'relative', overflow: "hidden" }}>

            <Grid item xs={11}>
                <Typography variant="h4" gutterBottom>{globalVariables.CHECKOUT_THANKS_STATUS[globalVariables.LANG]}</Typography>
                <Typography variant="h6">
                    {globalVariables.CHECKOUT_THANKS_REDIRECT[globalVariables.LANG]} <Link to={props.trackOrder}>{globalVariables.LABEL_HERE[globalVariables.LANG]}</Link>
                </Typography>

                <img className="slider-moving-animation" src="https://cnnh.org/wp-content/uploads/2017/02/moving2348563724.jpg" alt="order dlivery" />
            </Grid>
        </Grid>
    )
}


class Checkout extends React.Component {
    state = {
        items: [],
        steps: getSteps(),
        stepIndex: 0,
        address: {},
        shipment: {},
        trackOrder: '/orders',
        isLoading: true
    }

    pendingPromises = [];
    componentWillUnmount = () => this.pendingPromises.map(p => p.cancel());
    appendPendingPromise = promise => this.pendingPromises = [...this.pendingPromises, promise];
    removePendingPromise = promise => this.pendingPromises = this.pendingPromises.filter(p => p !== promise);


    getStepContent = () => {
        switch (this.state.stepIndex) {
            case 0:
                return <CheckoutAddress handleNextButton={this.handleNextButtonAddress} />;
            case 1:
                return <Payment
                    address={this.state.address}
                    totalPrice={this.props.items.reduce((total, item) => total + (item.sale_price? item.sale_price : item.price) * item.cart.quantity, 0)}
                    shipment={this.state.shipment}
                    handleNextButton={this.handleNextButtonPayment}
                    handleBackButton={this.stepBack} />;
            case 2:
                return <Route render={props => <ThanksView {...props} trackOrder={this.state.trackOrder} />} />
            default:
                return 'Unknown step';
        }
    }

    componentDidMount() {
        this.setState({ isLoading: false });
    }
    stepAdvance = () => {
        this.setState({ stepIndex: this.state.stepIndex + 1 });
    }

    stepBack = () => {
        this.setState({ stepIndex: this.state.stepIndex - 1 });
    }

    handleNextButtonAddress = (address) => {
        if (address === undefined) {
            alert('Please select your address or create a new one.')
            return
        }
        
        let tebxOrder = this.props.items.findIndex(item => item.tebx === 1) !== -1;

        const wrappedPromise = cancelablePromise(axios.post(`${address.id}/shipping/`, {tebxOrder}));
        this.appendPendingPromise(wrappedPromise);

        wrappedPromise
            .promise
            .then(res => {
                if(res.data.shipper_id){
                    this.setState({ address: address, shipment: res.data });
                    this.stepAdvance()
                }
                else
                    alert("Error, try again later.")
            })
            .then(() => this.removePendingPromise(wrappedPromise))
            .catch(err => { 
                alert("Error! Your address maybe be unsupported.") 
            })
    }

    handleNextButtonPayment = () => {
        if (this.state.address === undefined) return //handle error

        this.setState({ isLoading: true })
        
        const products = []
        let tebxOrder = false;

        this.props.items.forEach(item => {
            let data = { id: item.id, quantity: item.cart.quantity, tebx: item.tebx }
            products.push(data);
            if(item.tebx && !tebxOrder) tebxOrder = true;
        });

        this.props.handleCartStart()

        const data = {
            address: this.state.address.id,
            tebxOrder: tebxOrder,
            products: products,
            token: this.state.address._token,
            referral: cookies.get(globalVariables.AFFILIATE_COOKIE) !== undefined ? cookies.get(globalVariables.AFFILIATE_COOKIE) : 0
        }

        const wrappedPromise = cancelablePromise(checkoutAPI.post('', data));
        this.appendPendingPromise(wrappedPromise);

        wrappedPromise
            .promise
            .then(res => {
                const url = res.data.url.split("/")
                const token = url.pop();
                const id = url.pop();
                
                this.props.handleClearCart()
                const trackOrder = "orders/" + id + '/' + token;
                this.setState({ trackOrder: trackOrder, isLoading: false })
                this.stepAdvance()
                this.props.handleCartSuccess("العملية تمت بنجاح")
            })
            .then(() => this.removePendingPromise(wrappedPromise))
            .catch(err => {
                if (!err.isCanceled) {
                    this.setState({ isLoading: false })
                }
                this.props.handleCartFail("فشل في تنفيذ العملية")
            })



    }

    render() {
        const { classes, numItems, cartIsLoading, isPopup, serverMessage, messageType, handlePopupClose } = this.props;
        const { isLoading } = this.state
        return (
            <React.Fragment>
                <Helmet>
                    <title>{globalVariables.PAGE_TITLE_CHECKOUT[globalVariables.LANG]}</title>
                </Helmet>
                <Snackbar
                    style={{ bottom: '50px' }}
                    anchorOrigin={{
                        vertical: 'bottom',
                        horizontal: 'center',
                    }}
                    open={isPopup && serverMessage !== ""}
                    autoHideDuration={6000}
                    onClose={handlePopupClose}
                >
                    <MySnackbar
                        className={classes.margin}
                        onClose={handlePopupClose}
                        variant={messageType}
                        message={serverMessage}
                    />

                </Snackbar>


                {cartIsLoading || isLoading || numItems || this.state.stepIndex === 2 ?
                    <React.Fragment>
                        <Stepper steps={this.state.steps} stepIndex={this.state.stepIndex} />
                        <Grid container item justify="center" alignItems="center" className={classes.root} md={10} sm={10} xs={11} spacing={2}>
                            {isLoading && this.state.stepIndex === 1 ?
                                <Grid container alignItems="center" justify="center" >
                                    <ClipLoader
                                        sizeUnit={"px"}
                                        size={75}
                                        color={'#123abc'}
                                        loading={isLoading}
                                    />
                                </Grid> : null
                            }
                            {isLoading && this.state.stepIndex === 1 ? null : this.getStepContent()}
                        </Grid>
                    </React.Fragment>
                    :
                    <Grid container item justify="center" className={classes.root} md={10} sm={10} xs={11} spacing={2}>
                        <CartEmpty />
                    </Grid>
                }

            </React.Fragment>
        );
    }



}
const mapStateToProps = state => {
    return {
        numItems: state.cart.numItems,
        items: state.cart.items,
        isPopup: state.cart.popup,
        cartIsLoading: state.cart.isLoading,
        serverMessage: state.cart.message,
        messageType: state.cart.messageType
    }
}

const mapDispatchToProps = dispatch => {
    return {
        handleClearCart: () => dispatch(clearCart()),
        handleCartStart: () => dispatch(cartStart()),
        handleCartSuccess: (message) => dispatch(cartSuccess(message)),
        handleCartFail: (message) => dispatch(cartFail(message)),
        handlePopupClose: () => dispatch(cartFinish()),
    }
}
export default withRouter(connect(mapStateToProps, mapDispatchToProps)(withStyles(styles)(Checkout)));