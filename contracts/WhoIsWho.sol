// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

///-------------------------------------------------------------------
///  __          ___          _____  __          ___
///  \ \        / / |        |_   _| \ \        / / |
///   \ \  /\  / /| |__   ___  | |  __\ \  /\  / /| |__   ___
///    \ \/  \/ / | '_ \ / _ \ | | / __\ \/  \/ / | '_ \ / _ \
///     \  /\  /  | | | | (_) || |_\__ \\  /\  /  | | | | (_) |
///      \/  \/   |_| |_|\___/_____|___/ \/  \/   |_| |_|\___/
///
///-------------------------------------------------------------------
///
/// wagmi

import "erc721a/contracts/ERC721A.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

error WhoIsWho__MaxMint();
error WhoIsWho__InsufficientFunds();
error WhoIsWho__StageNotReady();
error WhoIsWho__InvalidProof();
error WhoIsWho__AlreadyClaimed();
error WhoIsWho__NonExistentTokenId();

contract WhoIsWho is ERC721A, Ownable, ReentrancyGuard {
    using Strings for uint256;

    enum SaleStage {
        IDLE,
        PRESALE_OG,
        PRESALE_WL,
        PUBLIC_SALE
    }

    ///////////////////////////////////////////////
    /// Constants
    //////////////////////////////////////////////

    /// Presale price for OG members
    uint256 public constant PRESALE_PRICE_OG = 0.025 ether;

    /// Presale price for whitelist members
    uint256 public constant PRESALE_PRICE_WL = 0.025 ether;

    /// Total supply
    uint16 public constant TOTAL_SUPPLY = 5000;

    /// Interval for OG members to mint their token during presale
    uint16 public constant PRESALE_INTERVAL = 15 minutes;

    /// Number of reserved tokens
    uint16 public constant RESERVED_TOKENS = 50;

    /// Maximum token per wallet for OG
    uint8 public constant MAX_TOKEN_PER_OG_WALLET = 2;

    /// Maximum token per wallet
    uint8 public constant MAX_TOKEN_PER_WALLET = 1;

    ///////////////////////////////////////////////
    /// Storage
    //////////////////////////////////////////////

    /// Price per token for public sale
    uint256 public price;

    /// Presale Date
    uint64 public presaleDate;

    /// Public sale date
    uint64 public publicSaleDate;

    /// Reveal Date
    uint64 public revealDate;

    /// Merkle roots for OG
    bytes32 public ogMerkleRoot;

    /// Merkle roots for whitelist members
    bytes32 public wlMerkleRoot;

    /// Metadata URI
    string public metadataBaseURI;

    /// Records of already claimed OG wallets
    mapping(address => bool) public hasOgClaimed;

    /// Records of already claimed whitelist wallets
    mapping(address => bool) public hasWlClaimed;

    ///////////////////////////////////////////////
    /// Events
    //////////////////////////////////////////////

    event SetPrice(uint256 indexed _price);

    event SetMetadataBaseURI(string indexed _uri);

    event SetOgMerkleRoot(bytes32 indexed _merkleRoot);

    event SetWlMerkleRoot(bytes32 indexed _merkleRoot);

    event SetPresaleDate(uint64 indexed _date);

    event SetPublicSaleDate(uint64 indexed _date);

    event SetRevealDate(uint64 indexed _date);

    event Withdraw();

    ///////////////////////////////////////////////
    /// Constructor
    //////////////////////////////////////////////

    constructor(
        uint256 _price,
        uint64 _presaleDate,
        uint64 _publicSaleDate,
        uint64 _revealDate,
        bytes32 _ogMerkleRoot,
        bytes32 _wlMerkleRoot,
        string memory _metadataBaseURI
    ) ERC721A("Who Is Who", "WhoIsWho") {
        price = _price;

        /**
         * @notice Initial presale, public, and reveal dates are set during contract's deployment.
         * These are changeable variables; this might change after the contract has been deployed
         */
        presaleDate = _presaleDate;
        publicSaleDate = _publicSaleDate;
        revealDate = _revealDate;

        ogMerkleRoot = _ogMerkleRoot;
        wlMerkleRoot = _wlMerkleRoot;
        metadataBaseURI = _metadataBaseURI;

        _safeMint(_msgSender(), RESERVED_TOKENS);
    }

    ///////////////////////////////////////////////
    /// Modifiers
    //////////////////////////////////////////////

    modifier mintCompliance(
        uint256 _mintAmount,
        uint256 _price,
        uint256 _maxPurchasePerWallet
    ) {
        if (_mintAmount > _maxPurchasePerWallet) {
            revert WhoIsWho__MaxMint();
        }

        /**
         * @dev Overflow is impossible because `_mintAmount` is validated first by checking if
         * it is greater than `_maxPurchasePerWallet`, where `_maxPurchasePerWallet` is determined
         * by the admin, and `price` is either a constant or determined by the admin
         */
        unchecked {
            uint256 totalSupplyAfterMint = totalSupply() + _mintAmount;

            if (totalSupplyAfterMint > TOTAL_SUPPLY) {
                revert WhoIsWho__MaxMint();
            }

            uint256 totalCost = _price * _mintAmount;

            if (msg.value < totalCost) {
                revert WhoIsWho__InsufficientFunds();
            }
        }
        _;
    }

    modifier stageCompliance(SaleStage _stage) {
        SaleStage stage = getSaleStage();

        if (stage != _stage) {
            revert WhoIsWho__StageNotReady();
        }
        _;
    }

    ///////////////////////////////////////////////
    /// Public methods
    //////////////////////////////////////////////

    function ogMint(
        uint256 _mintAmount,
        bytes32[] calldata _merkleProof
    )
        external
        payable
        nonReentrant
        stageCompliance(SaleStage.PRESALE_OG)
        mintCompliance(_mintAmount, PRESALE_PRICE_OG, MAX_TOKEN_PER_OG_WALLET)
    {
        if (hasOgClaimed[_msgSender()]) {
            revert WhoIsWho__AlreadyClaimed();
        }

        bytes32 leaf = keccak256(abi.encodePacked(_msgSender()));

        if (!MerkleProof.verify(_merkleProof, ogMerkleRoot, leaf)) {
            revert WhoIsWho__InvalidProof();
        }

        hasOgClaimed[_msgSender()] = true;
        _safeMint(_msgSender(), _mintAmount);
    }

    function wlMint(
        uint256 _mintAmount,
        bytes32[] calldata _merkleProof
    )
        external
        payable
        nonReentrant
        stageCompliance(SaleStage.PRESALE_WL)
        mintCompliance(_mintAmount, PRESALE_PRICE_WL, MAX_TOKEN_PER_WALLET)
    {
        if (hasWlClaimed[_msgSender()]) {
            revert WhoIsWho__AlreadyClaimed();
        }

        bytes32 leaf = keccak256(abi.encodePacked(_msgSender()));

        if (!MerkleProof.verify(_merkleProof, wlMerkleRoot, leaf)) {
            revert WhoIsWho__InvalidProof();
        }

        hasWlClaimed[_msgSender()] = true;
        _safeMint(_msgSender(), _mintAmount);
    }

    function mint(
        uint256 _mintAmount
    )
        external
        payable
        nonReentrant
        stageCompliance(SaleStage.PUBLIC_SALE)
        mintCompliance(_mintAmount, price, MAX_TOKEN_PER_WALLET)
    {
        _safeMint(_msgSender(), _mintAmount);
    }

    function tokenURI(uint256 _tokenId) public view virtual override returns (string memory) {
        if (!_exists(_tokenId)) {
            revert WhoIsWho__NonExistentTokenId();
        }

        if (!isReveal()) {
            return hiddenMetadataUri();
        }

        string memory currentBaseURI = _baseURI();

        if (bytes(currentBaseURI).length > 0) {
            return string(abi.encodePacked(currentBaseURI, _tokenId.toString(), ".json"));
        }

        return "";
    }

    function hiddenMetadataUri() public view returns (string memory) {
        string memory currentBaseURI = _baseURI();

        if (bytes(currentBaseURI).length > 0) {
            return string(abi.encodePacked(currentBaseURI, "hidden.json"));
        }

        return "";
    }

    function getSaleStage() public view returns (SaleStage stage) {
        uint64 timeNow = uint64(block.timestamp);

        if (timeNow >= publicSaleDate) {
            return SaleStage.PUBLIC_SALE;
        }

        uint64 interval;

        /**
         * @dev Overflow is impossible because `presaleDate` is determined by the admin and
         * `PRESALE_INTERVAL` is a constant
         */
        unchecked {
            /**
             * @dev Adding `PRESALE_INTERVAL` to the presale date, it means that the minting
             * timeframe for OG members has come to an end
             */
            interval = presaleDate + PRESALE_INTERVAL;
        }

        if (timeNow >= interval) {
            return SaleStage.PRESALE_WL;
        }

        /**
         * @dev During presale, OG members will have priority access to minting their
         * tokens, followed by whitelist members who can start minting only after a
         * specified time period defined in `PRESALE_INTERVAL` has elapsed
         */
        if (timeNow >= presaleDate) {
            return SaleStage.PRESALE_OG;
        }

        return SaleStage.IDLE;
    }

    ///////////////////////////////////////////////
    /// Internal methods
    //////////////////////////////////////////////

    function isReveal() internal view returns (bool) {
        return uint64(block.timestamp) >= revealDate;
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return metadataBaseURI;
    }

    ///////////////////////////////////////////////
    /// Admin methods
    //////////////////////////////////////////////

    function mint(address _recipient, uint256 _mintAmount) external payable onlyOwner {
        _safeMint(_recipient, _mintAmount);
    }

    function setPrice(uint256 _price) external onlyOwner {
        price = _price;
        emit SetPrice(_price);
    }

    function setMetadataBaseURI(string memory _uri) external onlyOwner {
        metadataBaseURI = _uri;
        emit SetMetadataBaseURI(_uri);
    }

    function setOgMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        ogMerkleRoot = _merkleRoot;
        emit SetOgMerkleRoot(_merkleRoot);
    }

    function setWlMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        wlMerkleRoot = _merkleRoot;
        emit SetWlMerkleRoot(_merkleRoot);
    }

    function setPresaleDate(uint64 _date) external onlyOwner {
        presaleDate = _date;
        emit SetPresaleDate(_date);
    }

    function setPublicSaleDate(uint64 _date) external onlyOwner {
        publicSaleDate = _date;
        emit SetPublicSaleDate(_date);
    }

    function setRevealDate(uint64 _date) external onlyOwner {
        revealDate = _date;
        emit SetRevealDate(_date);
    }

    /**
     * @notice Owner should set the base uri first for the collection before the
     * owner can withdraw all the funds
     */
    function withdraw() external onlyOwner {
        string memory currentBaseURI = _baseURI();
        require(bytes(currentBaseURI).length > 0, "Base URI not set");
        (bool os, ) = payable(owner()).call{value: address(this).balance}("");
        require(os, "Transfer failed");
        emit Withdraw();
    }
}
