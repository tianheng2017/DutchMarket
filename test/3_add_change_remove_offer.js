const Token = artifacts.require("Token");
const DutchMarket = artifacts.require("DutchMarket");

const { toWei } = web3.utils;

contract('DutchMarket', (accounts) => {
    it('Add a offer order of 1 ETH for 1000 Token', async () => {
        const tokenInstance = await Token.deployed();
        const dutchMarketInstance = await DutchMarket.deployed();
        // Deposit 1000 tokens into the contract's account
        await dutchMarketInstance.setMode(0, { from: accounts[0] });
        await dutchMarketInstance.depositToken(
            tokenInstance.address,
            toWei("1000", "ether"),
            { from: accounts[0] }
        );
        // Check the number of sell orders
        await dutchMarketInstance.setMode(1, { from: accounts[0] });
        const offersCount1 = await dutchMarketInstance.offersCount({ from: accounts[0] });
        // Add a sell order for 1000 tokens at a price of 1 ETH
        await dutchMarketInstance.addOffer(
            tokenInstance.address,
            toWei("1", "ether"),
            toWei("1000", "ether"),
            { from: accounts[0] }
        );
        // Check the number of sell orders again
        const offersCount2 = await dutchMarketInstance.offersCount({ from: accounts[0] });
        // Check if the number of sell orders has increased by 1
        assert.equal(offersCount1.toNumber() + 1, offersCount2.toNumber(), "successful addOffer 1 ETH for 1000 Token");
    });
    it('change offer order of 0.9 ETH for 1000 Token', async () => {
        const dutchMarketInstance = await DutchMarket.deployed();
        // Get the global sell order ID
        const lastOfferNumber = await dutchMarketInstance.lastOfferNumber({ from: accounts[0] });
        // Modify the sell order price
        const price = toWei("0.9", "ether");
        await dutchMarketInstance.changeOffer(lastOfferNumber, price, { from: accounts[0] })
        // Check the sell order price
        const offer = await dutchMarketInstance.getOffer(lastOfferNumber, { from: accounts[0] });
        // Check if the sell order price is equal to 0.9
        assert.equal(Number(offer[1]), Number(price), "successful change a offer order of 0.9 ETH for 1000 Token");
    });
    it('remove offer order', async () => {
        const dutchMarketInstance = await DutchMarket.deployed();
        // Get the global sell order ID
        const lastOfferNumber = await dutchMarketInstance.lastOfferNumber({ from: accounts[0] });
        // Get the number of sell orders
        const offersCount1 = await dutchMarketInstance.offersCount({ from: accounts[0] });
        // Delete this sell order
        await dutchMarketInstance.removeOffer(lastOfferNumber, { from: accounts[0] })
        // Get the number of sell orders again.
        const offersCount2 = await dutchMarketInstance.offersCount({ from: accounts[0] });
        // Check if the number of sell orders has decreased by 1
        assert.equal(Number(offersCount1) - 1, Number(offersCount2), "successful remove offer order");
    });
});
