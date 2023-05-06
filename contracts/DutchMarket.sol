// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DutchMarket {
    // Contract owner
    address public owner;
    
    // Account collection mapping (private, not public)
    // Account address => Ethereum balance + (Token address => Token balance)
    mapping(address => Account) private accounts;

    // Global sell order mapping
    mapping(uint256 => Offer) public offers;
    // Global sell order number
    uint256 public lastOfferNumber;
    // Number of sell orders
    uint256 public offersCount;

    // Global buy order mapping
    mapping(uint256 => Bid) public bids;
    // Global buy order number
    uint256 public lastBidNumber;
    // Number of buy orders
    uint256 public bidsCount;

    // Mode enumeration
    enum Mode { DepositWithdraw, Offer, BidOpening, Matching }
    // Interval between mode switches
    uint256 public constant timeBetweenModes = 5 minutes;
    // Time of the last mode change
    uint256 public timeOfLastModeChange;
    // Current mode
    Mode public currentMode;

    // Reentrancy lock
    bool private locked;
    modifier noReentrancy() {
        require(!locked, "Reentrant call");
        locked = true;
        _;
        locked = false;
    }

    // Account structure
    struct Account {
        // Custodial ETH balance
        uint256 balance;
        // Custodial token balance
        mapping(address => uint256) tokenBalances;
    }
    // Buy order structure
    struct Bid {
        // Token contract, defaults to address(0) before disclosure
        address tokenAddress;
        // Buy price, defaults to 0 before disclosure
        uint256 price;
        // Quantity, defaults to 0 before disclosure
        uint256 quantity;
        // Buy order number
        uint256 bidNumber;
        // Agent address (B)
        address buyer;
        // Real buyer address (A), defaults to bytes32(0) before disclosure
        address bidder;
        // Blinded bid hash
        // Calculated as: keccak256(abi.encode(tokenAddress, price, quantity, secret))
        bytes32 blindedBid;
        // Agent B's signature
        bytes signature;
        // Whether the blinded bid has been disclosed
        bool revealed;
        // Whether the order has been matched
        bool matched;
    }
    // Sell order structure
    struct Offer {
        // Token contract
        address tokenAddress;
        // Sell price
        uint256 price;
        // Quantity
        uint256 quantity;
        // Sell order number
        uint256 offerNumber;
        // Seller address
        address seller;
        // Whether the order has been matched
        bool matched;
    }
    // Modifier, callable only by contract owner
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function.");
        _;
    }

    // Contract initialization
    constructor() {
        // Set contract owner to contract deployer
        owner = msg.sender;
        // Set mode to Deposit/Withdraw mode
        currentMode = Mode.DepositWithdraw;
        // Record mode change time as current block time
        timeOfLastModeChange = block.timestamp;
    }

    // Deposit and withdrawal events
    event Deposit(address indexed tokenAddress, address indexed account, uint256 amount);
    event Withdraw(address indexed tokenAddress, address indexed account, uint256 amount);
    // Seller events
    event OfferAdded(address indexed tokenAddress, uint256 indexed offerNumber, uint256 price, uint256 quantity, address indexed account);
    event OfferChanged(uint256 indexed offerNumber, uint256 price, address indexed account);
    event OfferRemoved(uint256 indexed offerNumber, address indexed account);
    // Buyer events
    event BidRevealed(uint256 offerNumber, address tokenAddress, uint256 indexed price, uint256 indexed quantity, address indexed bidderAddress);
    // Trade event
    event Trade(address tokenAddress, uint256 offerNumber, uint256 bidNumber, uint256 price, uint256 indexed quantity, address indexed seller, address indexed buyer);

    // Forcefully set mode
    // Convenient for testing, not needed in production environment, can only be called by contract owner
    function setMode(Mode mode) public onlyOwner {
        currentMode = mode;
    }

    // Switch to next mode, triggered by external scheduled tasks
    function nextMode() public {
        // Check if more than 5 minutes have passed
        if (block.timestamp >= timeOfLastModeChange + timeBetweenModes) {
            // If not the last mode, increment
            if (currentMode != Mode.Matching) {
                currentMode = Mode(uint256(currentMode) + 1);
            } else {
                // Otherwise, start from the beginning
                currentMode = Mode.DepositWithdraw;
            }
            // Record mode change time as current block time
            timeOfLastModeChange = block.timestamp;
        }
    }

    // Get account's custodial ETH balance
    function getAccountBalance() public view returns (uint256) {
        return accounts[msg.sender].balance;
    }

    // Get account's custodial token balance
    function getAccountTokenBalance(address tokenAddress) public view returns (uint256) {
        return accounts[msg.sender].tokenBalances[tokenAddress];
    }

    // ETH deposit
    function depositETH() public payable {
        // Validate mode
        require(currentMode == Mode.DepositWithdraw, "Not in DepositWithdraw mode");
        // Check deposit amount must be greater than 0
        require(msg.value > 0, "Amount must be greater than 0");
        // Increase custodial ETH balance
        accounts[msg.sender].balance += msg.value;
        // Emit ETH deposit event
        emit Deposit(address(this), msg.sender, msg.value);
    }

    // ETH withdrawal
    function withdrawETH(uint256 amount) public noReentrancy {
        // Validate mode
        require(currentMode == Mode.DepositWithdraw, "Not in DepositWithdraw mode");
        // Check withdrawal amount must be greater than 0
        require(amount > 0, "Amount must be greater than 0");
        // Check custodial ETH balance must be >= withdrawal amount
        require(accounts[msg.sender].balance >= amount, "Insufficient balance");
        // Deduct from custodial ETH balance
        accounts[msg.sender].balance -= amount;
        // Add to user's wallet balance
        payable(msg.sender).transfer(amount);
        // Emit ETH withdrawal event
        emit Withdraw(address(this), msg.sender, amount);
    }

    // Token deposit
    function depositToken(address tokenAddress, uint256 amount) public {
        // Validate mode
        require(currentMode == Mode.DepositWithdraw, "Not in DepositWithdraw mode");
        // Ensure a valid address
        require(tokenAddress != address(0) && tokenAddress != address(this), "Invalid Token Address");
        // Check deposit amount
        require(amount > 0, "Amount must be greater than 0");
        // Transfer token to contract
        require(IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        // Increase account token balance
        accounts[msg.sender].tokenBalances[tokenAddress] += amount;
        // Emit token deposit event
        emit Deposit(tokenAddress, msg.sender, amount);
    }

    // Token withdrawal
    function withdrawToken(address tokenAddress, uint256 amount) public noReentrancy {
        // Validate mode
        require(currentMode == Mode.DepositWithdraw, "Not in DepositWithdraw mode");
        // Pass by reference
        Account storage account = accounts[msg.sender];
        // Ensure a valid address
        require(tokenAddress != address(0) && tokenAddress != address(this), "Invalid Token Address");
        // Check withdrawal amount must be greater than 0
        require(amount > 0, "Amount must be greater than 0");
        // Check account balance must be >= withdrawal amount
        require(account.tokenBalances[tokenAddress] >= amount, "Insufficient token balance");
        // Deduct from account balance
        account.tokenBalances[tokenAddress] -= amount;
        // Increase user's wallet token balance
        require(IERC20(tokenAddress).transfer(msg.sender, amount), "Transfer failed");
        // Emit withdrawal event
        emit Withdraw(tokenAddress, msg.sender, amount);
    }

    // Get offer information
    function getOffer(uint256 offerNumber) public view returns (Offer memory) {
        // Validate offer number
        require(offers[offerNumber].offerNumber != 0, "Offer not found");
        // Return offer information
        return offers[offerNumber];
    }

    // Create offer
    // Parameters: token address, sell price, sell quantity
    function addOffer(address tokenAddress, uint256 price, uint256 quantity) public {
        // Validate mode
        require(currentMode == Mode.Offer, "Not in Offer mode");
        // Ensure a valid address
        require(tokenAddress != address(0) && tokenAddress != address(this), "Invalid Token Address");
        // Sell price must be greater than 0
        require(price > 0, "Price must be greater than 0");
        // Sell quantity must be greater than 0
        require(quantity > 0, "Quantity must be greater than 0");
        // Increase global offer number
        lastOfferNumber++;
        // Increase offer count
        offersCount++;
        // Create offer
        offers[lastOfferNumber] = Offer(tokenAddress, price, quantity, lastOfferNumber, msg.sender, false);
        // Emit offer added event
        emit OfferAdded(tokenAddress, lastOfferNumber, price, quantity, msg.sender);
    }

    // Modify offer
    // Parameters: offer number, sell price
    function changeOffer(uint256 offerNumber, uint256 price) public {
        // Validate mode
        require(currentMode == Mode.Offer, "Not in Offer mode");
        // Authorization: only the offer creator can modify the offer
        require(offers[offerNumber].seller == msg.sender, "Only the offer creator can change the offer");
        // Sell price must be greater than 0
        require(price > 0, "Price must be greater than 0");
        // Seller can only lower the price, not raise it
        require(offers[offerNumber].price > price, "Price can only be decreased");
        // Update sell price
        offers[offerNumber].price = price;
        // Emit offer changed event
        emit OfferChanged(offerNumber, price, msg.sender);
    }

    // Remove offer
    function removeOffer(uint256 offerNumber) public {
        // Validate mode
        require(currentMode == Mode.Offer, "Not in Offer mode");
        // Authorization: only the offer creator can remove the offer
        require(offers[offerNumber].seller == msg.sender, "Only the offer creator can remove the offer");
        // Delete offer
        delete offers[offerNumber];
        // Decrease offer count
        offersCount--;
        // Emit offer removed event
        emit OfferRemoved(offerNumber, msg.sender);
    }

    // Get bid information
    function getBid(uint256 bidNumber) public view returns (Bid memory) {
        // Validate bid number
        require(bids[bidNumber].bidNumber != 0, "Bid not found");
        // Return bid information
        return bids[bidNumber];
    }

    // Create a blind bid
    // Called by agent B
    // Parameters: blinded bid hash, signature
    function addBid(
        bytes32 _blindedBid, 
        bytes memory _signature
    ) public returns (uint256) {
        // Verify mode
        require(currentMode == Mode.BidOpening, "Not in BidOpening mode");
        // Verify the length of the blinded bid hash
        require(bytes32(_blindedBid).length == 32, "The blindedBid length must be 32");
        // Increment global bid number
        lastBidNumber++;
        // Increment bid count
        bidsCount++;
        // Create a blind bid
        bids[lastBidNumber] = Bid(
            // Token address
            address(0),
            // Price
            0,
            // Quantity
            0,
            // Bid number
            lastBidNumber,
            // Agent B
            msg.sender,
            // Real buyer A
            address(0),
            // Blinded bid hash
            _blindedBid,
            // Signature of agent B
            _signature,
            // Revealed or not
            false,
            // Matched or not
            false
        );
        // Return bid number
        return lastBidNumber;
    }

    // Get the address of agent B
    // Parameters: blinded bid hash, signature
    // _blindedBid = keccak256(abi.encode(tokenAddress, price, quantity, realBuyerA))
    // _signature = Signature of agent B for _blindedBid
    function getBuyer(
        bytes32 _blindedBid, 
        bytes memory _signature
    ) public pure returns (address) {
        // Value of r in the ECDSA signature
        bytes32 r;
        // Value of s in the ECDSA signature
        bytes32 s;
        // Value of v in the ECDSA signature
        uint8 v;
        assembly {
            // Read the value of r from the signature data
            r := mload(add(_signature, 32))
            // Read the value of s from the signature data
            s := mload(add(_signature, 64))
            // Read the value of v from the signature data, and restrict it to the range of 0~255
            v := and(mload(add(_signature, 65)), 255)
        }
        // Determine the chain the signature belongs to based on the value of v
        if (v < 27) {
            v += 27;
        }
        // Add prefix
        bytes32 prefixedBlindedBid = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _blindedBid));
        // Verify signature using ECDSA and extract the address of the signer from the signature
        address buyer = ecrecover(prefixedBlindedBid, v, r, s);
        return buyer;
    }

    // Blind bid verification
    // Verify agent B + verify buyer A
    function verifyBid(
        uint256 bidNumber,
        address tokenAddress, 
        uint256 price, 
        uint256 quantity, 
        bytes32 _blindedBid
    ) public view returns (bool) {
        // Verify if the signer is agent B
        if (getBuyer(_blindedBid, bids[bidNumber].signature) != bids[bidNumber].buyer) {
            return false;
        }
        // Verify if the blinded bid hash matches the input parameters
        if (keccak256(abi.encode(tokenAddress, price, quantity, msg.sender)) != bids[bidNumber].blindedBid) {
            return false;
        }
        return true;
    }

    // Reveal a bid
    // Can only be called by the real buyer A, unless A and B are the same person. Otherwise, no one else can reveal it, including agent B (because it cannot be verified by verifyBid: Verify agent B + verify buyer A)
    // The seller will call this function to reveal the bid only when the price drops to the price that the real buyer A is satisfied with
    // Unrevealed bids will be ignored during the order matching period
    // Parameters: bid number, token address, price, quantity, blinded bid hash
    function BidReveal(uint256 bidNumber, address tokenAddress, uint256 price, uint256 quantity, bytes32 _blindedBid) public {
        // Verify mode
        require(currentMode == Mode.BidOpening, "Not in BidOpening mode");
        // Verify bid number
        require(bids[bidNumber].bidNumber != 0, "Bid not found");
        // Authentication, proving that A did intend to sign and submit the blinded bid in the first place
        require(verifyBid(bidNumber, tokenAddress, price, quantity, _blindedBid), "Invalid bid");
        // Ensure that the token address is a valid address
        require(tokenAddress != address(0) && tokenAddress != address(this), "Invalid Token Address");
        // Purchase price must be greater than 0
        require(price > 0, "Price must be greater than 0");
        // Purchase quantity must be greater than 0
        require(quantity > 0, "Quantity must be greater than 0");
        // Update bid data
        bids[bidNumber].tokenAddress = tokenAddress;
        bids[bidNumber].price = price;
        bids[bidNumber].quantity = quantity;
        bids[bidNumber].revealed = true;
        // Reveal the identity of the real buyer A
        bids[bidNumber].bidder = msg.sender;
        // Emit bid reveal event
        emit BidRevealed(bidNumber, tokenAddress, price, quantity, msg.sender);
    }

    // Remove a bid
    // Can only be called by agent B to prevent A from being exposed
    // Parameters: bid number
    function removeBid(uint256 bidNumber) public {
        // Verify mode
        require(currentMode == Mode.BidOpening, "Not in BidOpening mode");
        // Verify bid number
        require(bids[bidNumber].bidNumber != 0, "Bid not found");
        // Authentication, only agent B can operate, to prevent A from being exposed
        require(bids[bidNumber].buyer == msg.sender, "Only the bid creator can remove the bid");
        // Delete the bid
        delete bids[bidNumber];
        // Decrement the total bid count
        bidsCount--;
    }

    // Sort all sell orders in ascending order by price.
    // This allows buy orders to prioritize matching with the lowest-priced sell orders, and when two sell orders have the same price, the one with the longest waiting time will be prioritized. This ensures fairness.
    // This is a private function that can only be called within the contract.
    function sortOffers() private view returns (uint256[] memory) {
        uint256[] memory sortedOfferIndices = new uint256[](lastOfferNumber);
        // Initialize the sorting array.
        for (uint256 i = 0; i < lastOfferNumber; i++) {
            sortedOfferIndices[i] = i + 1;
        }
        // Use bubble sort to sort the sell orders.
        for (uint256 i = 0; i < lastOfferNumber - 1; i++) {
            for (uint256 j = 0; j < lastOfferNumber - i - 1; j++) {
                bool needSwap = false;
                // Compare prices.
                if (offers[sortedOfferIndices[j]].price > offers[sortedOfferIndices[j + 1]].price) {
                    needSwap = true;
                // If the prices are equal, compare the order number (prioritizing the one with the longest waiting time).
                } else if (offers[sortedOfferIndices[j]].price == offers[sortedOfferIndices[j + 1]].price) {
                    if (offers[sortedOfferIndices[j]].offerNumber > offers[sortedOfferIndices[j + 1]].offerNumber) {
                        needSwap = true;
                    }
                }
                if (needSwap) {
                    // Swap elements.
                    (sortedOfferIndices[j], sortedOfferIndices[j + 1]) = (sortedOfferIndices[j + 1], sortedOfferIndices[j]);
                }
            }
        }
        return sortedOfferIndices;
    }
    
    // Order Matching
    // Match all sell orders in order with buy orders until the buy order is fully executed.
    function orderMaching() public {
        // Verify the mode
        require(currentMode == Mode.Matching, "Not in Matching mode");

        // Get the sorted sell order indices
        uint256[] memory sortedOfferIndices = sortOffers();

        // Loop through all buy orders, starting from order number 1 to prioritize orders with longer wait times
        for (uint256 i = 1; i <= lastBidNumber; i++) {
            // Skip buy orders that have already been fully executed
            if (bids[i].matched == true) continue;
            // Skip unrevealed buy orders
            if (bids[i].revealed == false) continue;

            // Loop through the sorted sell orders
            for (uint256 k = 0; k < sortedOfferIndices.length; k++) {
                // Current sell order index
                uint256 j = sortedOfferIndices[k];

                // If the buy order has already been fully executed during the matching process, stop matching with other sell orders
                if (bids[i].matched == true) break;

                // If neither the buy nor the sell order has been fully executed
                // And the token types of both the buy and sell orders are the same
                // And the sell order price <= the buy order price, and the sell order quantity > 0, and the buy order quantity > 0
                // And the buyer and seller cannot be the same person
                if (
                    bids[i].matched == false &&
                    offers[j].matched == false && 
                    offers[j].tokenAddress == bids[i].tokenAddress && 
                    offers[j].price <= bids[i].price && 
                    offers[j].quantity > 0 && bids[i].quantity > 0 &&
                    offers[j].seller != bids[i].bidder
                ) {
                    // The trade quantity = sell order quantity < buy order quantity ? sell order quantity : buy order quantity
                    uint256 quantity = offers[j].quantity < bids[i].quantity ? offers[j].quantity : bids[i].quantity;

                    // The trade cost = trade quantity * sell order price
                    // When a sell offer at price p matches a buy order at price q ≥ p, the buyer always pays the lower price p.
                    uint256 cost = quantity * offers[j].price / 10 ** 18;

                    // Prevent account balances from going negative. If matching would result in a negative balance for the buyer or seller, skip the match.
                    // If the seller does not have enough tokens, skip this sell order and move on to the next.
                    if (accounts[offers[j].seller].tokenBalances[offers[j].tokenAddress] < quantity) continue;
                    // If the buyer does not have enough ETH, stop and match with the next buy order directly.
                    if (accounts[bids[i].bidder].balance < cost) break;

                    // Seller receives ETH
                    accounts[offers[j].seller].balance += cost;
                    // Seller deducts tokens
                    accounts[offers[j].seller].tokenBalances[offers[j].tokenAddress] -= quantity;
                    // Sell order quantity decreases
                    offers[j].quantity -= quantity;
                    // If the sell order quantity decreases to 0, mark the sell order as fully executed
                    if (offers[j].quantity == 0) {
                        // Mark as fully executed
                        offers[j].matched = true;
                        // Decrease the total sell order count
                        offersCount--;
                    }

                    // The actual buyer A deducts ETH
                    accounts[bids[i].bidder].balance -= cost;
                    // The actual buyer A receives tokens
                    accounts[bids[i].bidder].tokenBalances[bids[i].tokenAddress] += quantity;
                    // Buy order quantity decreases
                    bids[i].quantity -= quantity;
                    // If the buy order quantity decreases to 0, mark the buy order as fully executed
                    if (bids[i].quantity == 0) {
                        // Mark the buy order as fully executed
                        bids[i].matched = true;
                        // Decrease the total buy order count
                        bidsCount--;
                    }

                    // Emit the trade event
                    // Publicize the sell order number, buy order number, price, quantity, seller, and actual buyer A
                    emit Trade(offers[j].tokenAddress, offers[j].offerNumber, bids[i].bidNumber, offers[j].price, quantity, offers[j].seller, bids[i].bidder);
                }
            }
        }
    }
}