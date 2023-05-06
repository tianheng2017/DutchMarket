const Token = artifacts.require("Token");
const DutchMarket = artifacts.require("DutchMarket");

const ethers = require('ethers');
const { toWei } = web3.utils;

// Get the hash
// Parameters: token address, price, quantity, and actual buyer
function getHash(tokenAddress, price, quantity, trueBuyer) {
    // Calculate the bytes32 value for the actual buyer
    const trueBuyerBytes32 = ethers.utils.padZeros(ethers.utils.arrayify(trueBuyer), 32);
    const encodedData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256', 'bytes32'],
        [tokenAddress, price, quantity, trueBuyerBytes32]
    );
    const hash = ethers.utils.keccak256(encodedData);
    return hash;
}

// Get the signature
// Parameters: hash and agent
async function getSignature(messageHash, buyer) {
    return await web3.eth.sign(messageHash, buyer);
}

contract('DutchMarket', (accounts) => {
    it('Add a bid order of 1 ETH for 10 Token', async () => {
        const tokenInstance = await Token.deployed();
        const dutchMarketInstance = await DutchMarket.deployed();
        // Check the number of buy orders
        await dutchMarketInstance.setMode(2, { from: accounts[0] });
        const bidsCount1 = await dutchMarketInstance.bidsCount({ from: accounts[0] });
        // Add a buy order for 10 tokens at a price of 1 ETH
        // Understood. Based on the assumption that the agent B is accounts[0] and the actual buyer A is accounts[9].
        const price = toWei("1", "ether");
        const quantity = toWei("10", "ether");
        // Calculate the hash that includes the order information and the actual buyer A
        const messageHash = getHash(tokenInstance.address, price, quantity, accounts[9]);
        // Calculate the signature for agent B
        const signature = await getSignature(messageHash, accounts[0]);
        // Buy order created. Anyone monitoring the blockchain cannot see my data, as I only submitted a hash and a signature
        await dutchMarketInstance.addBid(
            messageHash,
            signature,
            { from: accounts[0] }
        );
        // Check the number of buy orders again
        const bidsCount2 = await dutchMarketInstance.bidsCount({ from: accounts[0] });
        // Check if the number of buy orders has increased by 1
        assert.equal(bidsCount1.toNumber() + 1, bidsCount2.toNumber(), "successful addBid");
    });
    it('Reveal a bid order', async () => {
        const tokenInstance = await Token.deployed();
        const dutchMarketInstance = await DutchMarket.deployed();
        // Get the global buy order ID
        const lastBidNumber = await dutchMarketInstance.lastBidNumber({ from: accounts[0] });
        // Price and quantity
        const price = toWei("1", "ether");
        const quantity = toWei("10", "ether");
        // Calculate the hash that includes the order information and the actual buyer A
        const messageHash = await getHash(tokenInstance.address, price, quantity, accounts[9]);
        // Simulate actual buyer A revealing the buy order
        await dutchMarketInstance.setMode(2, { from: accounts[0] });
        await dutchMarketInstance.BidReveal(
            lastBidNumber,
            tokenInstance.address,
            price,
            quantity,
            messageHash,
            { from: accounts[9] }
        );
        // Check the information of the buy order
        const bid = await dutchMarketInstance.getBid(lastBidNumber.toNumber(), { from: accounts[0] });
        // Check if the price and quantity have been updated, and if the buy order has been revealed
        assert.equal(bid[1], price, "successful verify price");
        assert.equal(bid[2], quantity, "successful verify quantity");
        assert.equal(bid[8], true, "successful verify revealed");
    });
    it('remove bid order', async () => {
        const dutchMarketInstance = await DutchMarket.deployed();
        // Get the global sell order ID
        const lastBidNumber = await dutchMarketInstance.lastBidNumber({ from: accounts[0] });
        // Check the number of buy orders
        const bidsCount1 = await dutchMarketInstance.bidsCount({ from: accounts[0] });
        // Delete this buy order
        await dutchMarketInstance.removeBid(lastBidNumber, { from: accounts[0] })
        // Check the number of buy orders again
        const bidsCount2 = await dutchMarketInstance.bidsCount({ from: accounts[0] });
        // Check if the number of buy orders has decreased by 1
        assert.equal(bidsCount1.toNumber() - 1, bidsCount2.toNumber(), "successful remove bid order");
    });
});
