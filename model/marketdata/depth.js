"use strict";

const ContractBased = require("./contractbased");

class Depth extends ContractBased {
    
    constructor(session, contract) {
        super(session, contract);
        
        this._exclude.push("_subscriptions");
        this._subscriptions = [ ];
        
        this.exchanges = [ ];
        this.bids = { };
        this.offers = { };
    }
    
    get validExchanges() {
        return this.contract.validExchanges;
    }
    
    async subscribe(exchange, rows) {
        return new Promise((yes, no) => {
            if (this.exchanges.indexOf(exchange) < 0) {
                this.exchanges.push(exchange);

                let copy = Object.clone(this.contract.summary);
                copy.exchange = exchange;

                this.bids[exchange] = { };
                this.offers[exchange] = { };

                let fail = (err, cancel) => {
                    this.unsubscribe(exchange);
                    no(err);
                };
                
                let req = this.session.service.mktDepth(copy, rows || 5);
                this._subscriptions.push(req);
                
                req.on("data", datum => {
                    if (datum.side == 1) this.bids[exchange][datum.position] = datum;
                    else this.offers[exchange][datum.position] = datum;
                    this.lastUpdate = Date.create();
                    this.emit("update", datum);
                    this.streaming = true;
                }).once("data", () => {
                    req.removeListener("error", fail);
                    req.on("error", (err, cancel) => {
                        this.emit("error", this.contract.summary.localSymbol + " level 2 quotes on " + exchange + " failed.");
                        this.unsubscribe(exchange);
                    });
                    
                    yes(this);
                }).once("error", fail).send();
            }
        });
    }
    
    unsubscribe(exchange) {
        let idx = this.exchanges.indexOf(exchange),
            req = this._subscriptions[idx];
        
        req.cancel();
        
        this._subscriptions.remove(req);
        this.exchanges.remove(exchange);
        delete this.bids[exchange];
        delete this.offers[exchange];
        
        if (this.exchanges.length == 0) {
            this.streaming = false;
            setTimeout(() => this.streaming = false, 100);
        }
        
        return this;
    }
    
    async stream(exchanges, rows, swallow) {
        if (typeof exchanges == "number") {
            rows = exchanges;
            exchanges = null;
        }
        
        if (exchanges == null) {
            swallow = true;
            if (this.exchanges.length) {
                exchanges = this.exchanges;
                this.exchanges = [ ];
            }
            else exchanges = this.validExchanges;
        }
        
        for (let i = 0; i < exchanges.length; i++) {
            try {
                await (this.subscribe(exchanges[i], rows));
            }
            catch (ex) {
                if (!swallow) throw ex;
            }
        }
        
        return this;
    }
    
    cancel() {
        this._subscriptions.map("cancel");
        this._subscriptions = [ ];
        this.streaming = false;
    }
    
}

module.exports = Depth;