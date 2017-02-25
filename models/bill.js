"use strict";

/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
        Schema = mongoose.Schema,
        timestamps = require('mongoose-timestamp');

var DataTable = require('mongoose-datatable');

DataTable.configure({
    verbose: false,
    debug: false
});
mongoose.plugin(DataTable.init);

var Dict = INCLUDE('dict');

var setPrice = MODULE('utils').setPrice;
var setDate = MODULE('utils').setDate;

/**
 * Article Schema
 */
var billSchema = new Schema({
    ref: {type: String, unique: true},
    type: {type: String, default: 'INVOICE_STANDARD'},
    isremoved: Boolean,
    /*title: {//For internal use only
     ref: String,
     autoGenerated: {type: Boolean, default: false} //For automatic process generated bills
     },*/
    Status: {type: String, default: 'DRAFT'},
    cond_reglement_code: {type: String, default: '30D'},
    mode_reglement_code: {type: String, default: 'CHQ'},
    //bank_reglement: {type: String},
    client: {
        id: {type: Schema.Types.ObjectId, ref: 'societe'},
        name: String,
        isNameModified: {type: Boolean}
    },
    /*contact: {
     id: {
     type: Schema.Types.ObjectId,
     ref: 'contact'
     },
     name: {type: String, default: ""},
     phone: String,
     email: String
     },*/
    contacts: [{
            type: Schema.Types.ObjectId,
            ref: 'contact'
        }],
    ref_client: {type: String, default: ""},
    imported: {type: Boolean, default: false}, //imported in accounting
    journalId: [Schema.Types.ObjectId], // Id transactions for accounting
    price_level: {type: String, default: "BASE", uppercase: true, trim: true},
    address: {type: String, default: ""},
    zip: {type: String, default: ""},
    town: {type: String, default: ""},
    country_id: {type: String, default: 'FR'},
    state_id: Number,
    datec: {type: Date, default: new Date, set: setDate},
    dater: {type: Date, set: setDate}, // date limit reglement
    dateOf: {type: Date}, // Periode de facturation du
    dateTo: {type: Date}, // au
    notes: [{
            title: String,
            note: String,
            public: {
                type: Boolean,
                default: false
            },
            edit: {
                type: Boolean,
                default: false
            }
        }],
    discount: {
        percent: {type: Number, default: 0},
        value: {type: Number, default: 0, set: setPrice} // total remise globale
    },
    total_ht: {type: Number, default: 0, set: setPrice},
    total_tva: [
        {
            tva_tx: Number,
            total: {type: Number, default: 0}
        }
    ],
    total_ttc: {type: Number, default: 0, set: setPrice},
    total_paid: {type: Number, default: 0, set: setPrice},
    shipping: {
        total_ht: {type: Number, default: 0, set: setPrice},
        tva_tx: {type: Number, default: 20},
        total_tva: {type: Number, default: 0}
    },
    author: {id: String, name: String},
    commercial_id: {id: {type: String}, name: String},
    entity: {type: String},
    modelpdf: String,
    orders: [{type: Schema.Types.ObjectId, ref: 'order'}],
    deliveries: [{type: Schema.Types.ObjectId, ref: 'delivery'}],
    groups: [Schema.Types.Mixed],
    weight: {type: Number, default: 0}, // Poids total
    lines: [{
            //pu: Number,
            qty: Number,
            tva_tx: Number,
            //group: {type: String, default: "1. DEFAULT"},
            //title: String,
            priceSpecific: {type: Boolean, default: false},
            pu_ht: Number,
            description: {type: String, default: ""},
            product_type: String,
            product: {
                id: {type: Schema.Types.ObjectId, ref: "Product"},
                name: {type: String},
                label: String,
                template: {type: String, default: "/partials/lines/classic.html"}
                //family: String
            },
            total_tva: Number,
            total_ttc: Number,
            discount: {type: Number, default: 0},
            no_package: Number, // Colis Number
            total_ht: {type: Number, set: setPrice},
            weight: {type: Number, default: 0},
            date_start: Date,
            date_end: Date
        }],
    history: [{
            date: {type: Date, default: Date.now},
            author: {
                id: String,
                name: String
            },
            mode: String, //email, order, alert, new, ...
            Status: String,
            msg: String
        }],
    feeBilling: {type: Boolean, default: true}, // Frais de facturation
    oldId: String // Only for import migration
}, {
    toObject: {virtuals: true},
    toJSON: {virtuals: true}
});

billSchema.plugin(timestamps);

// Gets listing
billSchema.statics.query = function (options, callback) {
    var self = this;

    // options.query {}
    // options.fileds {String}
    // options.page {String or Number}
    // options.max {String or Number}
    // options.id {String}

    options.page = U.parseInt(options.page) - 1;
    options.max = U.parseInt(options.max, 20);
    if (options.id && typeof (options.id) === 'string')
        options.id = options.id.split(',');
    if (options.page < 0)
        options.page = 0;
    var take = U.parseInt(options.max);
    var skip = U.parseInt(options.page * options.max);

    var query = options.query;
    if (!query.isremoved)
        query.isremoved = {$ne: true};

    //if (options.search)
    //    builder.in('search', options.search.keywords(true, true));
    if (options.id) {
        if (typeof options.id === 'object')
            options.id = {'$in': options.id};
        query._id = options.id;
    }

    var sort = "ref";

    if (options.sort)
        sort = options.sort;

    //console.log(query);

    this.find(query)
            .select(options.fields)
            .limit(take)
            .skip(skip)
            //.populate('category', "_id path url linker name")
            .sort(sort)
            //.lean()
            .exec(function (err, doc) {
                //console.log(doc);
                var data = {};
                data.count = doc.length;
                data.items = doc;
                data.limit = options.max;
                data.pages = Math.ceil(data.count / options.max);

                if (!data.pages)
                    data.pages = 1;
                data.page = options.page + 1;
                callback(null, data);
            });
};

/**
 * Pre-save hook
 */
billSchema.pre('save', function (next) {

    var self = this;
    var SeqModel = MODEL('Sequence').Schema;
    var EntityModel = MODEL('entity').Schema;

    this.dater = MODULE('utils').calculate_date_lim_reglement(this.datec, this.cond_reglement_code);

    if (this.isNew)
        this.history = [];

    MODULE('utils').sumTotal(this.lines, this.shipping, this.discount, this.client.id, function (err, result) {
        if (err)
            return next(err);

        self.total_ht = result.total_ht;
        self.total_tva = result.total_tva;
        self.total_ttc = result.total_ttc;
        self.weight = result.weight;

        if (self.total_ttc === 0)
            self.Status = 'DRAFT';

        if (!self.ref && self.isNew) {
            SeqModel.inc("PROV", function (seq) {
                //console.log(seq);
                self.ref = "PROV" + seq;
                next();
            });
        } else {
            if (self.Status != "DRAFT" && self.total_ttc != 0 && self.ref.substr(0, 4) == "PROV") {
                EntityModel.findOne({_id: self.entity}, "cptRef", function (err, entity) {
                    if (err)
                        console.log(err);

                    if (entity && entity.cptRef) {
                        SeqModel.inc("FA" + entity.cptRef, self.datec, function (seq) {
                            //console.log(seq);
                            self.ref = "FA" + entity.cptRef + seq;
                            next();
                        });
                    } else {
                        SeqModel.inc("FA", self.datec, function (seq) {
                            //console.log(seq);
                            self.ref = "FA" + seq;
                            next();
                        });
                    }
                });
            } else {
                self.ref = F.functions.refreshSeq(self.ref, self.datec);
                next();
            }
        }
    });
});

/**
 * inc - increment bill Number
 *
 * @param {function} callback
 * @api public
 */
billSchema.methods.setNumber = function () {
    var self = this;
    if (this.ref.substr(0, 4) == "PROV")
        SeqModel.inc("FA", function (seq) {
            //console.log(seq);
            self.ref = "FA" + seq;
        });
};

var statusList = {};
Dict.dict({dictName: 'fk_bill_status', object: true}, function (err, doc) {
    if (err) {
        console.log(err);
        return;
    }
    statusList = doc;
});

billSchema.virtual('status')
        .get(function () {
            var res_status = {};

            var status = this.Status;

            if (status === 'NOT_PAID' && this.dater > new Date()) //Check if late
                status = 'VALIDATE';

            if (status && statusList.values[status] && statusList.values[status].label) {
                //console.log(this);
                res_status.id = status;
                res_status.name = i18n.t(statusList.lang + ":" + statusList.values[status].label);
                //res_status.name = statusList.values[status].label;
                res_status.css = statusList.values[status].cssClass;
            } else { // By default
                res_status.id = status;
                res_status.name = status;
                res_status.css = "";
            }
            return res_status;

        });

/*var transactionList = [];
 
 TransactionModel.aggregate([
 {$group: {
 _id: '$bill.id',
 sum: {$sum: '$credit'}
 }}
 ], function (err, doc) {
 if (err)
 return console.log(err);
 
 transactionList = doc;
 });*/

billSchema.virtual('amount').get(function () {

    var amount = {};
    var id = this._id;



    /*if (transactionList) {
     for (var i = 0; i < transactionList.length; i++) {
     if (id.equals(transactionList[i]._id)) {
     amount.rest = this.total_ttc - transactionList[i].sum;
     amount.set = transactionList[i].sum;
     return amount;
     }
     }
     }*/

    return this.total_ttc - this.total_paid;
});


exports.Schema = mongoose.model('bill', billSchema, 'Facture');
exports.name = 'bill';
