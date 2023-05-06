const Token = artifacts.require("Token");
const DutchMarket = artifacts.require("DutchMarket");

const ethers = require('ethers');
const { toWei, fromWei } = web3.utils;

const num1 = toWei("1", "ether");
const num2 = toWei("2", "ether");
const num5 = toWei("5", "ether");
const num10 = toWei("10", "ether");
const num20 = toWei("20", "ether");
const num30 = toWei("30", "ether");
const num40 = toWei("40", "ether");
const num60 = toWei("60", "ether");

// Get the hash
// Parameters: token address, price, quantity, and actual buyer
function getHash(tokenAddress, price, quantity, trueBuyer) {
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
    it('Match 2 bid orders and 2 offer orders', async () => {
        const tokenInstance = await Token.deployed();
        const dutchMarketInstance = await DutchMarket.deployed();
        // Order Book:
        // Sell2 2 10
        // Sell1 1 10
        // Buy1 2 5
        // Buy2 2 10

        // Theoretical transaction steps:
        // 1. Buy 1 matches with Sell 1 first, and completes a transaction of 5 TOKENs at a price of 1 ETH. Buy 1 spends 5 ETH, and Sell 1 order has 5 TOKENs remaining.
        // 2. Buy 1 spends a total of 1 * 5 = 5 ETH.
        // 3. Buy 2 matches with Sell 1 next, and completes a transaction of the remaining 5 TOKENs of Sell 1 at a price of 1 ETH. Buy 2 spends 5 ETH, and Sell 1 order is fully filled.
        // 4. Buy 2 matches with Sell 2 and completes a transaction of 5 TOKENs at a price of 2 ETH. Buy 2 spends 10 ETH, and Sell 2 order has 5 TOKENs remaining.
        // 5. Buy 2 spends a total of 1 * 5 + 2 * 5 = 15 ETH.

        // 6. Contract account balance:
        // 7. Sell 1 deposits 20 tokens, sells 10 tokens, and has 10 tokens + 10 ETH remaining.
        // 8. Sell 2 deposits 30 tokens, sells 5 tokens, and has 25 tokens + 10 ETH remaining.
        // 9. Buy 1 deposits 40 ETH, spends 5 ETH, and has 35 ETH + 5 tokens remaining.
        // 10. Buy 2 deposits 60 ETH, spends 15 ETH, and has 45 ETH + 10 tokens remaining.

        //--------------------------------------Seller 1--------------------------------------
        // Seller 1 deposits 20 tokens into the contract's account
        await dutchMarketInstance.setMode(0, { from: accounts[0] });
        await dutchMarketInstance.depositToken(tokenInstance.address, num20,{
            from: accounts[1],
        });
        await dutchMarketInstance.setMode(1, { from: accounts[0] });
        // Seller 1 creates a sell order for 10 tokens at a price of 1 ETH
        await dutchMarketInstance.addOffer(
            tokenInstance.address,
            num1,
            num10,
            { from: accounts[1] }
        );
        //--------------------------------------Seller 1--------------------------------------

        //--------------------------------------Seller 2--------------------------------------
        // Seller 2 deposits 30 tokens into the contract's account
        await dutchMarketInstance.setMode(0, { from: accounts[0] });
        await dutchMarketInstance.depositToken(tokenInstance.address, num30, {
            from: accounts[2],
        });
        // Seller 2 creates a sell order for 10 tokens at a price of 2 ETH
        await dutchMarketInstance.setMode(1, { from: accounts[0] });
        await dutchMarketInstance.addOffer(
            tokenInstance.address,
            num2,
            num10,
            { from: accounts[2] }
        );
        //--------------------------------------Seller 2--------------------------------------

        //--------------------------------------Buyer 1--------------------------------------
        // Actual buyer 1 is accounts[3], and the agent is accounts[8]
        // Actual buyer 1 deposits 40 ETH into the contract's ETH account
        await dutchMarketInstance.setMode(0, { from: accounts[0] });
        await dutchMarketInstance.depositETH({
            from: accounts[3],
            value: num40,
        });
        await dutchMarketInstance.setMode(2, { from: accounts[0] });
        // Calculate the hash that includes the order information and actual buyer 1.
        const hash1 = getHash(tokenInstance.address, num2, num5, accounts[3]);
        // Calculate the signature for agent accounts[8]
        const signature1 = await getSignature(hash1, accounts[8]);
        // Agent accounts[8] creates a buy order for 5 tokens at a price of 2 ETH
        await dutchMarketInstance.addBid(
            hash1,
            signature1,
            { from: accounts[8] }
        );
        // Get the global buy order ID
        const lastBidNumber1 = await dutchMarketInstance.lastBidNumber({ from: accounts[0] });
        // Buyer 1 reveals the buy order.
        await dutchMarketInstance.BidReveal(
            lastBidNumber1,
            tokenInstance.address,
            num2,
            num5,
            hash1,
            { from: accounts[3] }
        );
        //--------------------------------------Buyer 1--------------------------------------

        //--------------------------------------Buyer 2--------------------------------------
        // Actual buyer 2 is accounts[4], and the agent is accounts[7]
        // Actual buyer 2 deposits 60 ETH into the contract's ETH account
        await dutchMarketInstance.setMode(0, { from: accounts[0] });
        await dutchMarketInstance.depositETH({
            from: accounts[4],
            value: num60,
        });
        await dutchMarketInstance.setMode(2, { from: accounts[0] });
        // Calculate the hash that includes the order information and actual buyer 2
        const hash2 = getHash(tokenInstance.address, num2, num10, accounts[4]);
        // Calculate the signature for agent accounts[7]
        const signature2 = await getSignature(hash2, accounts[7]);
        // Agent accounts[7] creates a buy order for 10 tokens at a price of 2 ETH
        await dutchMarketInstance.addBid(
            hash2,
            signature2,
            { from: accounts[7] }
        );
        // Get the global buy order ID
        const lastBidNumber2 = await dutchMarketInstance.lastBidNumber({ from: accounts[0] });
        // Buyer 2 reveals the buy order
        await dutchMarketInstance.BidReveal(
            lastBidNumber2,
            tokenInstance.address,
            num2,
            num10,
            hash2,
            { from: accounts[4] }
        );
        //--------------------------------------Buyer 2--------------------------------------

        //--------------------------------------Order matching-----------------------------------
        await dutchMarketInstance.setMode(3, { from: accounts[0] });
        await dutchMarketInstance.orderMaching();
        //--------------------------------------Order matching-----------------------------------

        //--------------------------------------Verify Seller 1----------------------------------
        // Check Seller 1's balance in the contract's ETH account. The balance should be 10 ETH in theory
        const seller1ETHBalance = await dutchMarketInstance.getAccountBalance({ from: accounts[1] });
        assert.equal(fromWei(seller1ETHBalance, "ether"), 10, "seller1 ETH balance is 10 ETH");
        // Check Seller 1's balance in the contract's token account. The balance should be 10 tokens in theory
        const seller1TokenBalance = await dutchMarketInstance.getAccountTokenBalance(
            tokenInstance.address, 
            { from: accounts[1] }
        );
        assert.equal(fromWei(seller1TokenBalance, "ether"), 10, "seller1 Token balance is 10");
        //--------------------------------------Verify Seller 1----------------------------------

        //--------------------------------------Verify Seller 2----------------------------------
        // Check Seller 2's balance in the contract's ETH account. The balance should also be 10 ETH in theory.
        const seller2ETHBalance = await dutchMarketInstance.getAccountBalance({ from: accounts[2] });
        assert.equal(fromWei(seller2ETHBalance, "ether"), 10, "seller1 ETH balance is 10 ETH");
        // Check Seller 2's balance in the contract's token account. The balance should be 25 tokens in theory
        const seller2TokenBalance = await dutchMarketInstance.getAccountTokenBalance(
            tokenInstance.address,
            { from: accounts[2] }
        );
        assert.equal(fromWei(seller2TokenBalance, "ether"), 25, "seller2 Token balance is 25");
        //--------------------------------------Verify Seller 2----------------------------------

        //--------------------------------------Verify Buyer 1----------------------------------
        // Check Buyer 1's balance in the contract's ETH account. The balance should be 35 ETH in theory
        const buyer1ETHBalance = await dutchMarketInstance.getAccountBalance({ from: accounts[3] });
        assert.equal(fromWei(buyer1ETHBalance, "ether"), 35, "buyer1 ETH balance is 35 ETH");
        // Check Buyer 1's balance in the contract's token account. The balance should be 5 tokens in theory
        const buyer1TokenBalance = await dutchMarketInstance.getAccountTokenBalance(
            tokenInstance.address,
            { from: accounts[3] }
        );
        assert.equal(fromWei(buyer1TokenBalance, "ether"), 5, "buyer1 Token balance is 5");
        //--------------------------------------Verify Buyer 1----------------------------------

        //--------------------------------------Verify Buyer 2----------------------------------
        // Check Buyer 2's balance in the contract's ETH account. The balance should be 45 ETH in theory
        const buyer2ETHBalance = await dutchMarketInstance.getAccountBalance({ from: accounts[4] });
        assert.equal(fromWei(buyer2ETHBalance, "ether"), 45, "buyer2 ETH balance is 45 ETH");
        // Check Buyer 2's balance in the contract's token account. The balance should be 20 tokens in theory
        const buyer2TokenBalance = await dutchMarketInstance.getAccountTokenBalance(
            tokenInstance.address,
            { from: accounts[4] }
        );
        assert.equal(fromWei(buyer2TokenBalance, "ether"), 10, "buyer2 Token balance is 10");
        //--------------------------------------Verify Buyer 2----------------------------------
    });
});