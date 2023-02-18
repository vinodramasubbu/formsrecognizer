const appInsights = require("applicationinsights");
appInsights.setup("cd78544d-f2e3-449d-adb2-316338b95b72").start();
//appInsights.setup("e217bd0d-95e4-4f31-bb78-9a1ee2c1cb11").start();

//UUID
const { v4: uuidv4 } = require('uuid');
//Form Recognizer declarations
const { FormRecognizerClient, FormTrainingClient, AzureKeyCredential } = require("@azure/ai-form-recognizer");
const endpoint = "https://azrecoform1.cognitiveservices.azure.com/";
const apiKey = "XXXXXXXXXXXXXXXXXXXXXXXX";
const client = new FormRecognizerClient(endpoint, new AzureKeyCredential(apiKey));
//SAS TOKEN 
const azure = require('azure-storage');
process.env.AZURE_STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=azrecoformstgacc1;AccountKey=XXXXXXXXXXXXXXXXXXXXXXXX;EndpointSuffix=core.windows.net';
const blobService = azure.createBlobService();
const startDate = new Date();
const expiryDate = new Date(startDate);
expiryDate.setMinutes(startDate.getMinutes() + 100);
startDate.setMinutes(startDate.getMinutes() - 100);
const sharedAccessPolicy = {
    AccessPolicy: {
        Permissions: azure.BlobUtilities.SharedAccessPermissions.READ,
        Start: startDate,
        Expiry: expiryDate
    }
};

module.exports = async function (context, myBlob) {
    context.log("JavaScript blob trigger function processed blob \n Blob:", context.bindingData.blobTrigger, "\n Blob Size:", myBlob.length, "Bytes");
    //Splitting container name and blob name 
    const cntplusblob = context.bindingData.blobTrigger;
    const splitstring = cntplusblob.split('/');
    console.log(splitstring);
    const containerName = splitstring[0];
    const blobName = splitstring[1];

    var token = blobService.generateSharedAccessSignature(containerName, blobName, sharedAccessPolicy);
    var sasUrl = blobService.getUrl(containerName, blobName, token);

    const data = JSON.stringify({
        source: sasUrl
    })
    console.log(data);

    const frmData = await recognizeReceipt(sasUrl,context).catch((err) => {
        console.error("The sample encountered an error:", err);
    });
    console.log(frmData);

    context.done();

   /** 
    context.bindings.outputDocument = JSON.stringify({
        id: uuidv4(),
        ReceiptType: context.bindingData.blobTrigger,
        MerchantName: myBlob.length
    });
    */
};



//function recognizeReceipt(sasUrl, context) {
async function recognizeReceipt(sasUrl,context) {
    //receiptUrl = "https://raw.githubusercontent.com/Azure/azure-sdk-for-python/master/sdk/formrecognizer/azure-ai-formrecognizer/tests/sample_forms/receipt/contoso-receipt.png";
    const poller = await client.beginRecognizeReceiptsFromUrl(sasUrl, {
        onProgress: (state) => { console.log(`status: ${state.status}`); }
    });

    const receipts = await poller.pollUntilDone();

    if (!receipts || receipts.length <= 0) {
        throw new Error("Expecting at lease one receipt in analysis result");
    }

    const receipt = receipts[0];
    console.log("First receipt:");
    const receiptTypeField = receipt.fields["ReceiptType"];
    if (receiptTypeField.valueType === "string") {
        console.log(`  Receipt Type: '${receiptTypeField.value || "<missing>"}', with confidence of ${receiptTypeField.confidence}`);
    }
    const merchantNameField = receipt.fields["MerchantName"];
    if (merchantNameField.valueType === "string") {
        console.log(`  Merchant Name: '${merchantNameField.value || "<missing>"}', with confidence of ${merchantNameField.confidence}`);
    }
    const transactionDate = receipt.fields["TransactionDate"];
    if (transactionDate.valueType === "date") {
        console.log(`  Transaction Date: '${transactionDate.value || "<missing>"}', with confidence of ${transactionDate.confidence}`);
    }
    const itemsField = receipt.fields["Items"];
    if (itemsField.valueType === "array") {
        for (const itemField of itemsField.value || []) {
            if (itemField.valueType === "object") {
                const itemNameField = itemField.value["Name"];
                if (itemNameField.valueType === "string") {
                    console.log(`    Item Name: '${itemNameField.value || "<missing>"}', with confidence of ${itemNameField.confidence}`);
                }
            }
        }
    }
    const totalField = receipt.fields["Total"];
    if (totalField.valueType === "number") {
        console.log(`  Total: '${totalField.value || "<missing>"}', with confidence of ${totalField.confidence}`);
    }

    const frmout = {
        ReceiptType: receiptTypeField.value,
        MerchantName: merchantNameField.value,
        TransactionDate: transactionDate.value,
        Total: totalField.value

    }
    //console.log(JSON.stringify(frmout));
    formData = JSON.stringify(frmout);
    //console.log(JSON.stringify(formData));
    //console.log(context.bindingData.blobTrigger);
    context.bindings.outputDocument = JSON.stringify({
        id: uuidv4(),
        ReceiptType: receiptTypeField.value,
        MerchantName: merchantNameField.value,
        TransactionDate: transactionDate.value,
        Total: totalField.value
    });

    return formData;

}